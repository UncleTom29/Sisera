"""Canonical market-data event types (spec §9)."""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from sisera_schemas.common import EventHeader


class TradeTick(EventHeader):
    price: Decimal
    quantity: Decimal
    side: str  # "buy" | "sell"
    trade_id: str | None = None


class BestBidAsk(EventHeader):
    bid_price: Decimal | None = None
    bid_size: Decimal | None = None
    ask_price: Decimal | None = None
    ask_size: Decimal | None = None


class OrderBookSnapshot(EventHeader):
    bids: list[tuple[Decimal, Decimal]] = Field(default_factory=list)  # (price, size)
    asks: list[tuple[Decimal, Decimal]] = Field(default_factory=list)


class OrderBookDelta(EventHeader):
    side: str  # "bid" | "ask"
    price: Decimal
    size: Decimal  # zero means the level is removed


class Candle(EventHeader):
    interval: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal = Decimal("0")


class FundingUpdate(EventHeader):
    funding_rate: Decimal
    next_funding_time_ms: int | None = None


class OpenInterestUpdate(EventHeader):
    open_interest: Decimal


class LiquidationEvent(EventHeader):
    side: str  # "buy" | "sell" (aggressor)
    quantity: Decimal
    price: Decimal


class OptionGreeksUpdate(EventHeader):
    delta: Decimal | None = None
    gamma: Decimal | None = None
    vega: Decimal | None = None
    theta: Decimal | None = None
    implied_volatility: Decimal | None = None


class ReferencePriceUpdate(EventHeader):
    reference_price: Decimal


class PredictionPriceUpdate(EventHeader):
    outcome_id: str
    probability: Decimal  # 0..1
    liquidity: Decimal = Decimal("0")


class NewsEvent(EventHeader):
    headline: str
    category: str | None = None
    severity: int | None = None
    source_name: str | None = None


class MacroEvent(EventHeader):
    indicator: str
    value: Decimal | None = None
    unit: str | None = None
