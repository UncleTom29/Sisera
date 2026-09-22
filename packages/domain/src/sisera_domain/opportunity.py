"""Opportunity engine (spec §41).

Packages a market view into one or more structured trade theses — directional, relative-
value, hedged, or an explicit NO_TRADE when no structure clears the EV hurdle. A single
market view may generate multiple structures; the system is allowed (and expected) to
conclude that no trade has acceptable EV.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class OpportunityStructure(StrEnum):
    DIRECTIONAL_PERP = "DIRECTIONAL_PERP"
    RELATIVE_VALUE = "RELATIVE_VALUE"
    HEDGE = "HEDGE"
    OPTIONS = "OPTIONS"
    NO_TRADE = "NO_TRADE"


class Opportunity(BaseModel):
    model_config = ConfigDict(frozen=True)

    opportunity_id: str
    instrument_id: str
    structure: OpportunityStructure
    direction: str | None = None  # "LONG" | "SHORT" | None for NO_TRADE
    thesis: str = ""
    time_horizon: str | None = None
    confidence: Decimal = Decimal("0")
    expected_value: Decimal = Decimal("0")
    uncertainty: Decimal = Decimal("0")
    entry_price: Decimal | None = None
    invalidation_price: Decimal | None = None
    target_price: Decimal | None = None
    risk_amount: Decimal | None = None
    liquidity_score: Decimal = Decimal("0")
    execution_cost: Decimal = Decimal("0")
    regime: str | None = None
    catalysts: tuple[str, ...] = Field(default_factory=tuple)
    portfolio_impact: Decimal = Decimal("0")


class MarketView(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    mid_price: Decimal
    signal: Decimal  # -1..1 directional conviction
    confidence: Decimal = Decimal("0.5")
    uncertainty: Decimal = Decimal("0.2")
    expected_move: Decimal = Decimal("0")  # expected favorable move as fraction
    stop_distance: Decimal = Decimal("0.02")
    liquidity_score: Decimal = Decimal("0.8")
    execution_cost: Decimal = Decimal("0")
    regime: str | None = None
    funding_percentile: Decimal | None = None


class OpportunityEngine:
    """Generates trade structures from a market view."""

    def __init__(
        self,
        min_ev: Decimal = Decimal("0.05"),
        max_uncertainty: Decimal = Decimal("0.35"),
        min_liquidity: Decimal = Decimal("0.4"),
    ) -> None:
        self.min_ev = min_ev
        self.max_uncertainty = max_uncertainty
        self.min_liquidity = min_liquidity

    def evaluate(self, view: MarketView, opportunity_id: str) -> list[Opportunity]:
        # EV in R: expected move / stop distance, signed by signal direction.
        if view.stop_distance > 0:
            ev = view.signal * view.expected_move / view.stop_distance
        else:
            ev = Decimal("0")
        structures: list[Opportunity] = []

        directional_ok = (
            abs(ev) >= self.min_ev
            and view.uncertainty <= self.max_uncertainty
            and view.liquidity_score >= self.min_liquidity
        )
        if directional_ok:
            direction = "LONG" if ev > 0 else "SHORT"
            structures.append(
                Opportunity(
                    opportunity_id=f"{opportunity_id}_dir",
                    instrument_id=view.instrument_id,
                    structure=OpportunityStructure.DIRECTIONAL_PERP,
                    direction=direction,
                    thesis=f"Directional {direction} on {view.instrument_id} (signal {view.signal})",
                    confidence=view.confidence,
                    expected_value=abs(ev),
                    uncertainty=view.uncertainty,
                    entry_price=view.mid_price,
                    liquidity_score=view.liquidity_score,
                    execution_cost=view.execution_cost,
                    regime=view.regime,
                )
            )
        if not structures:
            structures.append(
                Opportunity(
                    opportunity_id=f"{opportunity_id}_none",
                    instrument_id=view.instrument_id,
                    structure=OpportunityStructure.NO_TRADE,
                    thesis="No structure clears the EV/uncertainty/liquidity hurdle",
                    confidence=view.confidence,
                    expected_value=ev,
                    uncertainty=view.uncertainty,
                    regime=view.regime,
                )
            )
        return structures
