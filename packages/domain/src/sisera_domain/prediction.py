"""Prediction market domain (spec §27).

Prediction outcomes are their own domain — not ordinary spot tokens. Models represent the
event, its markets, outcomes, resolution rules and oracle, positions, and settlement.
Binary, multi-outcome, and scalar markets are supported. Probabilities are Decimal in
[0, 1].
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from sisera_domain.money import Asset


class MarketKind(StrEnum):
    BINARY = "BINARY"
    MULTI_OUTCOME = "MULTI_OUTCOME"
    SCALAR = "SCALAR"


class MarketStatus(StrEnum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    DISPUTED = "DISPUTED"
    CANCELLED = "CANCELLED"


class ResolutionRule(BaseModel):
    model_config = ConfigDict(frozen=True)

    rule_id: str
    description: str
    resolution_source: str  # e.g. "CME Fed funds futures", "chainlink oracle", "manual"
    criteria: dict[str, str] = Field(default_factory=dict)


class ResolutionOracle(BaseModel):
    model_config = ConfigDict(frozen=True)

    oracle_id: str
    name: str
    reliability: Decimal = Decimal("1.0")  # 0..1


class PredictionEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: str
    question: str
    category: str | None = None
    description: str | None = None
    expiry: datetime | None = None


class PredictionOutcome(BaseModel):
    model_config = ConfigDict(frozen=True)

    outcome_id: str
    label: str
    probability: Decimal = Decimal("0")  # market-implied probability 0..1
    payout_per_share: Decimal = Decimal("1")  # for scalar markets, a target value

    @field_validator("probability")
    @classmethod
    def _prob_range(cls, v: Decimal) -> Decimal:
        if v < 0 or v > 1:
            raise ValueError(f"Probability must be in [0, 1], got {v}")
        return v


class PredictionMarket(BaseModel):
    model_config = ConfigDict(frozen=True)

    market_id: str
    event_id: str
    kind: MarketKind
    outcomes: tuple[PredictionOutcome, ...]
    resolution_rule: ResolutionRule
    resolution_oracle: ResolutionOracle | None = None
    settlement_currency: Asset = Asset("USDC")
    liquidity: Decimal = Decimal("0")
    max_payout: Decimal = Decimal("0")
    resolution_risk: Decimal = Decimal("0")  # 0..1
    related_market_ids: tuple[str, ...] = Field(default_factory=tuple)
    status: MarketStatus = MarketStatus.OPEN

    def total_probability(self) -> Decimal:
        return sum((o.probability for o in self.outcomes), Decimal("0"))


class PredictionPosition(BaseModel):
    model_config = ConfigDict(frozen=True)

    position_id: str
    market_id: str
    outcome_id: str
    quantity: Decimal  # shares held
    avg_price: Decimal  # cost basis per share (probability scale for binary)


class PredictionSettlement(BaseModel):
    model_config = ConfigDict(frozen=True)

    settlement_id: str
    market_id: str
    resolved_outcome_id: str | None = None
    settled_price: Decimal  # 1.0 for winner, 0.0 for losers (binary); scalar value otherwise
    timestamp_ms: int


def settle_position(position: PredictionPosition, settlement: PredictionSettlement) -> Decimal:
    """Compute gross payout (in settlement currency) for a prediction position.

    For a binary-style settlement the winning outcome pays 1.0/share, losers pay 0.0.
    For scalar markets `settled_price` is the scalar value (this function is outcome-based,
    so it returns 1.0 only if the held outcome resolved as the winner).
    """
    if position.market_id != settlement.market_id:
        raise ValueError("Position and settlement belong to different markets")
    if settlement.resolved_outcome_id is None:
        return Decimal("0")
    payout_per_share = (
        Decimal("1") if position.outcome_id == settlement.resolved_outcome_id else Decimal("0")
    )
    return position.quantity * payout_per_share * settlement.settled_price
