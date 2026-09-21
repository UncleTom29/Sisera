from __future__ import annotations

import pytest

from sisera.data.cache import Cache
from sisera.data.models import BybitInstrument, CoinMarketData
from sisera.universe import UniverseManager


class _StubBybit:
    def __init__(self, instruments: list[BybitInstrument]) -> None:
        self._instruments = instruments

    def get_linear_perpetuals(self) -> list[BybitInstrument]:
        return self._instruments


class _StubCoinGecko:
    def __init__(self, markets: list[CoinMarketData] | Exception) -> None:
        self._markets = markets

    def get_top_markets(self, count: int) -> list[CoinMarketData]:
        if isinstance(self._markets, Exception):
            raise self._markets
        return self._markets[:count]


class _StubCoinPaprika:
    def __init__(self, markets: dict[str, CoinMarketData] | Exception | None = None) -> None:
        self._markets = markets or {}

    def get_markets_by_symbol(self) -> dict[str, CoinMarketData]:
        if isinstance(self._markets, Exception):
            raise self._markets
        return self._markets


def _instrument(base: str) -> BybitInstrument:
    return BybitInstrument(
        symbol=f"{base}USDT",
        base_coin=base,
        quote_coin="USDT",
        status="Trading",
        contract_type="LinearPerpetual",
    )


def _coin(symbol: str, rank: int, market_cap: float | None = None) -> CoinMarketData:
    return CoinMarketData(
        id=f"{symbol.lower()}-id",
        symbol=symbol,
        name=symbol,
        market_cap=market_cap if market_cap is not None else 1_000_000 / rank,
        market_cap_rank=rank,
        current_price=1.0,
    )


def _manager(bybit, coingecko, tmp_path, coinpaprika=None, universe_size=10) -> UniverseManager:
    return UniverseManager(
        bybit=bybit,
        coingecko=coingecko,
        coinpaprika=coinpaprika or _StubCoinPaprika(),
        cache=Cache(str(tmp_path / "test.db")),
        universe_size=universe_size,
    )


def test_universe_only_includes_bybit_listed_pairs(tmp_path):
    bybit = _StubBybit([_instrument("BTC"), _instrument("ETH")])
    coingecko = _StubCoinGecko(
        [_coin("BTC", 1), _coin("ETH", 2), _coin("SOMECOIN", 3)]  # SOMECOIN not on Bybit
    )
    universe = _manager(bybit, coingecko, tmp_path).get_universe()

    symbols = {p.symbol for p in universe}
    assert symbols == {"BTCUSDT", "ETHUSDT"}


def test_universe_stops_at_target_size(tmp_path):
    bases = [f"COIN{i}" for i in range(10)]
    bybit = _StubBybit([_instrument(b) for b in bases])
    coingecko = _StubCoinGecko([_coin(b, i + 1) for i, b in enumerate(bases)])
    universe = _manager(bybit, coingecko, tmp_path, universe_size=3).get_universe()

    assert len(universe) == 3
    assert [p.market_cap_rank for p in universe] == [1, 2, 3]


def test_duplicate_ticker_symbols_keep_only_highest_market_cap_match(tmp_path):
    # Two different CoinGecko coins share the ticker "ABC"; only one Bybit
    # contract exists for that base coin. The higher-ranked (lower rank number)
    # one should win, and the pair should not appear twice.
    bybit = _StubBybit([_instrument("ABC")])
    coingecko = _StubCoinGecko(
        [_coin("ABC", 1), _coin("ABC", 500)]  # duplicate ticker, different rank
    )
    universe = _manager(bybit, coingecko, tmp_path).get_universe()

    assert len(universe) == 1
    assert universe[0].market_cap_rank == 1


def test_second_call_uses_cache_not_a_fresh_fetch(tmp_path):
    call_count = {"n": 0}

    class CountingBybit(_StubBybit):
        def get_linear_perpetuals(self):
            call_count["n"] += 1
            return super().get_linear_perpetuals()

    bybit = CountingBybit([_instrument("BTC")])
    coingecko = _StubCoinGecko([_coin("BTC", 1)])
    manager = _manager(bybit, coingecko, tmp_path)

    manager.get_universe()
    manager.get_universe()

    assert call_count["n"] == 1


def test_force_refresh_bypasses_cache(tmp_path):
    call_count = {"n": 0}

    class CountingBybit(_StubBybit):
        def get_linear_perpetuals(self):
            call_count["n"] += 1
            return super().get_linear_perpetuals()

    bybit = CountingBybit([_instrument("BTC")])
    coingecko = _StubCoinGecko([_coin("BTC", 1)])
    manager = _manager(bybit, coingecko, tmp_path)

    manager.get_universe()
    manager.get_universe(force_refresh=True)

    assert call_count["n"] == 2


def test_market_cap_reconciled_against_coinpaprika_within_tolerance(tmp_path):
    bybit = _StubBybit([_instrument("BTC")])
    coingecko = _StubCoinGecko([_coin("BTC", 1, market_cap=1_000_000)])
    coinpaprika = _StubCoinPaprika({"BTC": _coin("BTC", 1, market_cap=1_005_000)})  # 0.5% off

    universe = _manager(bybit, coingecko, tmp_path, coinpaprika=coinpaprika).get_universe()

    assert universe[0].market_cap == 1_000_000  # primary value used
    assert universe[0].market_cap_diverged is False
    assert universe[0].market_cap_source == "coingecko"


def test_market_cap_divergence_flagged_beyond_tolerance(tmp_path):
    bybit = _StubBybit([_instrument("BTC")])
    coingecko = _StubCoinGecko([_coin("BTC", 1, market_cap=1_000_000)])
    coinpaprika = _StubCoinPaprika({"BTC": _coin("BTC", 1, market_cap=1_500_000)})  # 50% off

    universe = _manager(bybit, coingecko, tmp_path, coinpaprika=coinpaprika).get_universe()

    assert universe[0].market_cap == 1_000_000  # primary still used
    assert universe[0].market_cap_diverged is True


def test_coingecko_outage_fails_over_to_coinpaprika_ranking(tmp_path):
    bybit = _StubBybit([_instrument("BTC"), _instrument("ETH")])
    coingecko = _StubCoinGecko(RuntimeError("simulated CoinGecko outage"))
    coinpaprika = _StubCoinPaprika(
        {"BTC": _coin("BTC", 1, market_cap=2_000_000), "ETH": _coin("ETH", 2, market_cap=500_000)}
    )

    universe = _manager(bybit, coingecko, tmp_path, coinpaprika=coinpaprika).get_universe()

    assert {p.symbol for p in universe} == {"BTCUSDT", "ETHUSDT"}
    assert all(p.market_cap_source == "coinpaprika" for p in universe)
    assert all(p.market_cap_diverged is False for p in universe)  # nothing to cross-check against


def test_both_sources_failing_raises(tmp_path):
    bybit = _StubBybit([_instrument("BTC")])
    coingecko = _StubCoinGecko(RuntimeError("simulated CoinGecko outage"))
    coinpaprika = _StubCoinPaprika(RuntimeError("simulated CoinPaprika outage"))

    with pytest.raises(RuntimeError):
        _manager(bybit, coingecko, tmp_path, coinpaprika=coinpaprika).get_universe()
