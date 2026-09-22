"""Canonical typed event schemas (ADR-003, spec §9/§12/§46).

Every event carries provenance: event timestamp, source timestamp, ingestion timestamp,
source, instrument ID, quality status, and sequence information where available. This is
the shared vocabulary for the NATS JetStream bus and the market-data platform.
"""

from sisera_schemas.common import DataQuality, EventHeader
from sisera_schemas.market_data import (
    BestBidAsk,
    Candle,
    FundingUpdate,
    LiquidationEvent,
    MacroEvent,
    NewsEvent,
    OpenInterestUpdate,
    OptionGreeksUpdate,
    OrderBookDelta,
    OrderBookSnapshot,
    PredictionPriceUpdate,
    ReferencePriceUpdate,
    TradeTick,
)
from sisera_schemas.orders import (
    FillEvent,
    OrderAcknowledged,
    OrderCancelled,
    OrderCreated,
    OrderRejected,
    OrderState,
    OrderSubmitted,
)

__all__ = [
    "DataQuality",
    "EventHeader",
    "TradeTick",
    "BestBidAsk",
    "OrderBookDelta",
    "OrderBookSnapshot",
    "Candle",
    "FundingUpdate",
    "OpenInterestUpdate",
    "LiquidationEvent",
    "OptionGreeksUpdate",
    "ReferencePriceUpdate",
    "PredictionPriceUpdate",
    "NewsEvent",
    "MacroEvent",
    "OrderState",
    "OrderCreated",
    "OrderSubmitted",
    "OrderAcknowledged",
    "FillEvent",
    "OrderCancelled",
    "OrderRejected",
]
