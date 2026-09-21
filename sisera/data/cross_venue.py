from __future__ import annotations

import logging

import ccxt
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from sisera.config import config
from sisera.data.models import CrossVenueFundingRate

logger = logging.getLogger(__name__)

# Kraken doesn't run comparable perpetual funding (§3) — Binance/OKX/Gate.io are the
# CCXT-supported venues that do, in market-cap order of liquidity depth for majors.
_FALLBACK_EXCHANGE_IDS = ["binance", "okx", "gate"]

_RETRYABLE_ERRORS = (ccxt.NetworkError, ccxt.ExchangeNotAvailable, ccxt.RequestTimeout)


class CrossVenueFundingClient:
    """Cross-venue funding rate, via CCXT. See SCOPE.md §3, §5.

    Distinguishes a Bybit-specific squeeze from genuinely market-wide positioning —
    "funding is high and positive" alone only tells you the crowd is leaning long
    *on Bybit*.
    """

    def __init__(self, exchange_ids: list[str] | None = None) -> None:
        self._exchange_ids = exchange_ids or _FALLBACK_EXCHANGE_IDS
        self._exchanges: dict[str, ccxt.Exchange] = {}

    def _exchange(self, exchange_id: str) -> ccxt.Exchange:
        if exchange_id not in self._exchanges:
            exchange_class = getattr(ccxt, exchange_id)
            self._exchanges[exchange_id] = exchange_class(
                {"timeout": int(config.http_timeout_seconds * 1000)}
            )
        return self._exchanges[exchange_id]

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        retry=retry_if_exception_type(_RETRYABLE_ERRORS),
    )
    def _fetch_one(self, exchange_id: str, base_coin: str) -> CrossVenueFundingRate | None:
        exchange = self._exchange(exchange_id)
        unified_symbol = f"{base_coin}/USDT:USDT"
        try:
            data = exchange.fetch_funding_rate(unified_symbol)
        except (ccxt.BadSymbol, ccxt.ExchangeError) as exc:
            logger.info("%s has no funding rate for %s: %s", exchange_id, unified_symbol, exc)
            return None
        if data.get("fundingRate") is None:
            return None
        return CrossVenueFundingRate(
            exchange=exchange_id,
            symbol=unified_symbol,
            funding_rate=float(data["fundingRate"]),
            timestamp_ms=data.get("fundingTimestamp"),
        )

    def get_funding_rate(self, base_coin: str) -> CrossVenueFundingRate | None:
        """Try each configured exchange in order, returning the first that has this pair.

        Returns None (not an exception) if no configured venue lists it — this is an
        optional cross-check signal, not a required dependency (§5).
        """
        for exchange_id in self._exchange_ids:
            try:
                result = self._fetch_one(exchange_id, base_coin)
            except Exception as exc:  # noqa: BLE001 — a failed cross-check shouldn't break the caller
                logger.warning("Cross-venue funding fetch failed on %s: %s", exchange_id, exc)
                continue
            if result is not None:
                return result
        return None
