"""Tests for market-data normalization (ADR-010)."""

from __future__ import annotations

from decimal import Decimal

from sisera_marketdata import normalize_candles, normalize_orderbook, normalize_ticker, normalize_trade
from sisera_schemas import DataQuality


def test_normalize_ticker_produces_all_events() -> None:
    raw = {
        "symbol": "BTCUSDT",
        "lastPrice": "64250.5",
        "markPrice": "64251.0",
        "indexPrice": "64240.0",
        "fundingRate": "0.00015",
        "openInterest": "1234567",
        "bid1Price": "64250.0",
        "ask1Price": "64251.0",
    }
    bba, ref, funding, oi = normalize_ticker(
        raw, instrument_id="bybit_btc_perp", source="bybit", quality=DataQuality.LIVE
    )
    assert bba.bid_price == Decimal("64250.0")
    assert bba.ask_price == Decimal("64251.0")
    assert ref.reference_price == Decimal("64240.0")
    assert funding.funding_rate == Decimal("0.00015")
    assert oi.open_interest == Decimal("1234567")
    assert all(e.quality == DataQuality.LIVE for e in (bba, ref, funding, oi))


def test_stale_quality_is_explicit_not_silent() -> None:
    raw = {"symbol": "BTCUSDT", "lastPrice": "100", "indexPrice": "100"}
    bba, *_ = normalize_ticker(
        raw, instrument_id="x", source="bybit", quality=DataQuality.STALE
    )
    assert bba.quality == DataQuality.STALE


def test_normalize_orderbook() -> None:
    raw = {
        "s": "BTCUSDT",
        "b": [["64250.0", "1.5"], ["64249.5", "2.0"]],
        "a": [["64251.0", "1.0"], ["64251.5", "3.0"]],
        "ts": 123456789,
    }
    book = normalize_orderbook(raw, instrument_id="x", source="bybit", quality=DataQuality.LIVE)
    assert book.bids == [(Decimal("64250.0"), Decimal("1.5")), (Decimal("64249.5"), Decimal("2.0"))]
    assert book.asks[0] == (Decimal("64251.0"), Decimal("1.0"))
    assert book.source_timestamp_ms == 123456789


def test_normalize_candles() -> None:
    rows = [
        [1700000000000, "100", "110", "90", "105", "1000", "105000"],
    ]
    candles = normalize_candles(
        rows, instrument_id="x", source="bybit", interval="1h", quality=DataQuality.LIVE
    )
    assert len(candles) == 1
    assert candles[0].open == Decimal("100")
    assert candles[0].close == Decimal("105")
    assert candles[0].volume == Decimal("1000")
    assert candles[0].source_timestamp_ms == 1700000000000


def test_normalize_trade_side_parsing() -> None:
    buy = normalize_trade(
        {"price": "64250", "size": "0.1", "side": "Buy", "timestamp": 123},
        instrument_id="x",
        source="bybit",
        quality=DataQuality.LIVE,
    )
    assert buy.side == "buy"
    sell = normalize_trade(
        {"price": "64250", "size": "0.1", "side": "Sell", "timestamp": 123},
        instrument_id="x",
        source="bybit",
        quality=DataQuality.LIVE,
    )
    assert sell.side == "sell"
    assert sell.quantity == Decimal("0.1")
