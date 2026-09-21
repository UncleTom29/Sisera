from __future__ import annotations

import logging

from sisera.config import config
from sisera.data.bybit import BybitClient
from sisera.data.cache import Cache
from sisera.data.coingecko import CoinGeckoClient
from sisera.data.coinpaprika import CoinPaprikaClient
from sisera.data.models import CoinMarketData, UniversePair
from sisera.data.reconciliation import reconcile

logger = logging.getLogger(__name__)

_CACHE_KEY = "universe:top_pairs"


class UniverseManager:
    """Builds the tradable universe: Bybit-listed-first, then ranked by market cap.

    See SCOPE.md §4 — this is the opposite order from a generic "top-N globally,
    then intersect with the exchange" approach. By construction, every pair in the
    universe is tradable on Bybit, so there's no scan-but-can't-execute mismatch.
    """

    def __init__(
        self,
        bybit: BybitClient | None = None,
        coingecko: CoinGeckoClient | None = None,
        coinpaprika: CoinPaprikaClient | None = None,
        cache: Cache | None = None,
        universe_size: int | None = None,
    ) -> None:
        self._bybit = bybit or BybitClient()
        self._coingecko = coingecko or CoinGeckoClient()
        self._coinpaprika = coinpaprika or CoinPaprikaClient()
        self._cache = cache or Cache(config.cache_db_path)
        self._universe_size = universe_size or config.universe_size

    def get_universe(self, force_refresh: bool = False) -> list[UniversePair]:
        if not force_refresh:
            cached = self._cache.get(_CACHE_KEY)
            if cached is not None:
                logger.info("Universe loaded from cache (%d pairs)", len(cached))
                return [UniversePair.model_validate(p) for p in cached]

        universe = self._build_universe()
        self._cache.set(
            _CACHE_KEY,
            [p.model_dump() for p in universe],
            ttl_seconds=config.universe_cache_ttl_seconds,
        )
        return universe

    def _build_universe(self) -> list[UniversePair]:
        instruments = self._bybit.get_linear_perpetuals()
        bybit_symbol_by_base_coin = {inst.base_coin.upper(): inst.symbol for inst in instruments}

        # Fetch 1 fast page (up to 250 coins max) from market cap sources
        pool_size = min(max(self._universe_size * 2, 250), 250)

        primary_failed = False
        try:
            markets: list[CoinMarketData] = self._coingecko.get_top_markets(pool_size)
        except Exception as exc:  # noqa: BLE001 — total primary-source failure, fail over
            logger.warning(
                "CoinGecko fetch failed after retries — failover event, ranking from "
                "CoinPaprika alone this cycle: %s",
                exc,
            )
            markets = []
            primary_failed = True

        # CoinPaprika is queried every refresh (not just on outage/divergence, unlike
        # the general rule elsewhere in the data layer) because Universe refresh is
        # daily (§4) — one extra call is negligible against its free-tier budget, and
        # it's what lets reconciliation catch CoinGecko silently returning wrong data,
        # not just outages (§3). Higher-frequency scan-cycle data should NOT copy this
        # pattern — that's where redundant fallback calls would actually burn budget.
        try:
            coinpaprika_by_symbol = self._coinpaprika.get_markets_by_symbol()
        except Exception as exc:  # noqa: BLE001
            logger.warning("CoinPaprika fetch failed: %s", exc)
            coinpaprika_by_symbol = {}

        if primary_failed:
            if not coinpaprika_by_symbol:
                raise RuntimeError(
                    "Both CoinGecko and CoinPaprika failed — cannot build universe this cycle"
                )
            markets = sorted(coinpaprika_by_symbol.values(), key=lambda c: c.market_cap_rank)

        universe: list[UniversePair] = []
        seen_symbols: set[str] = set()
        diverged_count = 0
        for coin in markets:
            if coin.market_cap is None or coin.market_cap_rank is None:
                continue
            symbol = bybit_symbol_by_base_coin.get(coin.symbol.upper())
            if symbol is None or symbol in seen_symbols:
                # `symbol is None`: not listed on Bybit.
                # `symbol in seen_symbols`: a lower-ranked coin sharing a ticker with
                # one already matched (symbol collisions are real and not rare in
                # crypto) — first (highest market-cap) match wins.
                continue

            market_cap = coin.market_cap
            diverged = False
            if not primary_failed:
                fallback_coin = coinpaprika_by_symbol.get(coin.symbol.upper())
                if fallback_coin is not None and fallback_coin.market_cap is not None:
                    result = reconcile(
                        primary=coin.market_cap,
                        fallback=fallback_coin.market_cap,
                        tolerance_pct=config.reconciliation_tolerance_pct,
                    )
                    market_cap = result.value
                    diverged = result.diverged
                    if diverged:
                        diverged_count += 1
                        logger.warning(
                            "Market cap divergence for %s: coingecko=$%.0f coinpaprika=$%.0f (%.1f%%)",
                            symbol,
                            coin.market_cap,
                            fallback_coin.market_cap,
                            result.divergence_pct,
                        )

            seen_symbols.add(symbol)
            universe.append(
                UniversePair(
                    symbol=symbol,
                    base_coin=coin.symbol.upper(),
                    market_cap_source="coinpaprika" if primary_failed else "coingecko",
                    market_cap_source_id=coin.id,
                    market_cap=market_cap,
                    market_cap_rank=coin.market_cap_rank,
                    market_cap_diverged=diverged,
                    name=coin.name,
                )
            )
            if len(universe) >= self._universe_size:
                break

        if diverged_count:
            logger.info(
                "%d/%d universe pairs had market-cap divergence beyond %.1f%% tolerance",
                diverged_count,
                len(universe),
                config.reconciliation_tolerance_pct,
            )

        if len(universe) < self._universe_size:
            for inst in instruments:
                if inst.symbol not in seen_symbols:
                    seen_symbols.add(inst.symbol)
                    universe.append(
                        UniversePair(
                            symbol=inst.symbol,
                            base_coin=inst.base_coin.upper(),
                            market_cap_source="bybit",
                            market_cap_source_id=inst.symbol.lower(),
                            market_cap=500_000_000.0,
                            market_cap_rank=len(universe) + 1,
                            market_cap_diverged=False,
                        )
                    )
                    if len(universe) >= self._universe_size:
                        break

        logger.info("Built universe: %d pairs", len(universe))
        return universe
