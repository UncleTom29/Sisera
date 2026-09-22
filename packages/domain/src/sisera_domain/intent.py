"""AI Intent Compiler schema (spec §21, ADR-008).

The LLM converts natural language ("Buy $20,000 of ETH if ETH breaks today's high…")
into this **typed** `TradeIntent`. The schema is validated deterministically; the AI may
generate the intent, but only the deterministic policy/risk/approval/OMS path controls
actual execution. The compiler never places trades.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class IntentAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    REDUCE = "REDUCE"
    CLOSE = "CLOSE"


class TriggerType(StrEnum):
    IMMEDIATE = "IMMEDIATE"
    BREAKOUT = "BREAKOUT"
    BREAKDOWN = "BREAKDOWN"
    LIMIT = "LIMIT"
    STOP = "STOP"


class TradeTrigger(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: TriggerType = TriggerType.IMMEDIATE
    reference: str | None = None  # e.g. "TODAY_HIGH"
    price: Decimal | None = None


class TradeIntent(BaseModel):
    """A schema-validated trading intent. Deterministic validation; no execution authority."""

    model_config = ConfigDict(frozen=True)

    instrument: str
    action: IntentAction
    quantity: Decimal | None = None
    notional: Decimal | None = None
    trigger: TradeTrigger = Field(default_factory=TradeTrigger)
    funding_percentile_max: Decimal | None = None
    portfolio_risk_fraction: Decimal | None = None
    max_slippage_bps: Decimal | None = None
    reduce_only: bool = False
    notes: str | None = None

    @model_validator(mode="after")
    def _quantity_xor_notional(self) -> TradeIntent:
        if self.quantity is None and self.notional is None:
            raise ValueError("TradeIntent requires either quantity or notional")
        if self.quantity is not None and self.quantity <= 0:
            raise ValueError("quantity must be positive")
        if self.notional is not None and self.notional <= 0:
            raise ValueError("notional must be positive")
        return self


class InvalidIntent(ValueError):
    pass


def compile_intent(payload: dict) -> TradeIntent:
    """Validate an LLM-produced (or user-provided) payload into a typed TradeIntent.

    Raises `InvalidIntent` on any schema violation. This is the deterministic gate between
    the AI and the execution pipeline.
    """
    try:
        return TradeIntent(**payload)
    except Exception as exc:
        raise InvalidIntent(f"Invalid trade intent: {exc}") from exc
