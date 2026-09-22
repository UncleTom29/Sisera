"""Market-data normalization (ADR-010).

Maps raw venue payloads (Bybit V5 shapes) into the canonical `sisera_schemas` events. The
normalizer is explicit about data quality: callers must pass the `DataQuality` that the
source connector determined — a synthetic/fallback reading is never presented as LIVE.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sisera_schemas import (
    BestBidAsk,
    Candle,
    DataQuality,
    FundingUpdate,
    OpenInterestUpdate,
    OrderBookSnapshot,
    ReferencePriceUpdate,
    TradeTick,
)


def _dec(v: Any) -> Decimal:
    return Decimal(str(v))


def normalize_ticker(
    raw: dict[str, Any],
    *,
    instrument_id: str,
    source: str,
    quality: DataQuality,
) -> tuple[BestBidAsk, ReferencePriceUpdate, FundingUpdate, OpenInterestUpdate]:
    """Normalize a Bybit V5 linear ticker row into the canonical ticker events.

    `raw` is a single element of the `result.list` from `/v5/market/tickers`.
    """
    bid = _dec(raw["bid1Price"]) if raw.get("bid1Price") else None
    ask = _dec(raw["ask1Price"]) if raw.get("ask1Price") else None
    last = _dec(raw["lastPrice"])

    bba = BestBidAsk(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        bid_price=bid,
        ask_price=ask,
    )
    ref = ReferencePriceUpdate(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        reference_price=_dec(raw["indexPrice"]) if raw.get("indexPrice") else last,
    )
    funding = FundingUpdate(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        funding_rate=_dec(raw.get("fundingRate", 0)),
    )
    oi = OpenInterestUpdate(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        open_interest=_dec(raw.get("openInterest", 0)),
    )
    return bba, ref, funding, oi


def normalize_orderbook(
    raw: dict[str, Any],
    *,
    instrument_id: str,
    source: str,
    quality: DataQuality,
) -> OrderBookSnapshot:
    """Normalize a Bybit V5 orderbook response into an OrderBookSnapshot.

    `raw` is the `result` of `/v5/market/orderbook`: `{"s", "b": [[p,s]...], "a": [[p,s]...], "ts"}`.
    """
    bids = [(_dec(p), _dec(s)) for p, s in raw.get("b", [])]
    asks = [(_dec(p), _dec(s)) for p, s in raw.get("a", [])]
    return OrderBookSnapshot(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        bids=bids,
        asks=asks,
        source_timestamp_ms=int(raw.get("ts", 0)) or None,
    )


def normalize_candles(
    rows: list[list[Any]],
    *,
    instrument_id: str,
    source: str,
    interval: str,
    quality: DataQuality,
) -> list[Candle]:
    """Normalize Bybit V5 kline rows (each `[ts_ms, open, high, low, close, volume, turnover]`)
    into Candle events."""
    candles: list[Candle] = []
    for row in rows:
        candles.append(
            Candle(
                source=source,
                instrument_id=instrument_id,
                quality=quality,
                interval=interval,
                open=_dec(row[1]),
                high=_dec(row[2]),
                low=_dec(row[3]),
                close=_dec(row[4]),
                volume=_dec(row[5]),
                source_timestamp_ms=int(row[0]),
            )
        )
    return candles


def normalize_trade(
    raw: dict[str, Any],
    *,
    instrument_id: str,
    source: str,
    quality: DataQuality,
) -> TradeTick:
    """Normalize a public trade record into a TradeTick."""
    return TradeTick(
        source=source,
        instrument_id=instrument_id,
        quality=quality,
        price=_dec(raw["price"]),
        quantity=_dec(raw.get("size", raw.get("quantity", 0))),
        side="buy" if raw.get("side", "").lower().startswith("buy") else "sell",
        trade_id=str(raw.get("trade_id")) if raw.get("trade_id") else None,
        source_timestamp_ms=int(raw.get("timestamp", 0)) or None,
    )
