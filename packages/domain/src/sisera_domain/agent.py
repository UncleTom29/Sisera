"""Agent autonomy and strategy manifests (spec §22, §23, §24).

Agents are first-class, governed by explicit autonomy levels, a strict lifecycle, and
assigned capital limits. Strategy manifests are schema-validated, versioned, and immutable
after deployment. An agent never has unrestricted access merely because it holds wallet
credentials (ADR-009).
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class AutonomyLevel(StrEnum):
    RESEARCH = "RESEARCH"
    SUGGEST = "SUGGEST"
    CONFIRM = "CONFIRM"
    POLICY_AUTO = "POLICY_AUTO"
    AUTONOMOUS = "AUTONOMOUS"
    EMERGENCY_RISK_ONLY = "EMERGENCY_RISK_ONLY"


class LifecycleStage(StrEnum):
    DRAFT = "DRAFT"
    BACKTEST = "BACKTEST"
    STRESS_TEST = "STRESS_TEST"
    PAPER = "PAPER"
    SHADOW = "SHADOW"
    LIMITED_LIVE = "LIMITED_LIVE"
    LIVE = "LIVE"


class AgentCapital(BaseModel):
    """Assigned capital and hard risk constraints for an agent (spec §23)."""

    model_config = ConfigDict(frozen=True)

    capital: Decimal = Decimal("0")
    instruments: tuple[str, ...] = Field(default_factory=tuple)
    venues: tuple[str, ...] = Field(default_factory=tuple)
    max_leverage: Decimal = Decimal("1")
    max_position_notional: Decimal = Decimal("0")
    max_daily_loss: Decimal = Decimal("0")
    max_drawdown: Decimal = Decimal("0")
    risk_per_trade: Decimal = Decimal("0.005")
    max_transactions_per_day: int = 0
    requires_approval: bool = True


class StrategyManifest(BaseModel):
    """Versioned, schema-validated strategy manifest (spec §22)."""

    model_config = ConfigDict(frozen=True)

    manifest_id: str
    name: str
    version: int = 1
    universe: dict = Field(default_factory=dict)  # e.g. {"instruments": ["BTC", "ETH"]}
    signals: dict = Field(default_factory=dict)
    filters: dict = Field(default_factory=dict)
    risk: dict = Field(default_factory=dict)
    execution: dict = Field(default_factory=dict)
    autonomy: dict = Field(default_factory=dict)
    deployed: bool = False


# Lifecycle transition table (spec §24). DRAFT -> LIVE is forbidden without a privileged,
# audit-logged override.
_LIFECYCLE_ORDER: dict[LifecycleStage, int] = {
    LifecycleStage.DRAFT: 0,
    LifecycleStage.BACKTEST: 1,
    LifecycleStage.STRESS_TEST: 2,
    LifecycleStage.PAPER: 3,
    LifecycleStage.SHADOW: 4,
    LifecycleStage.LIMITED_LIVE: 5,
    LifecycleStage.LIVE: 6,
}


class InvalidLifecycleTransition(ValueError):
    pass


def validate_lifecycle_transition(
    current: LifecycleStage, target: LifecycleStage, privileged_override: bool = False
) -> None:
    """Enforce the DRAFT -> ... -> LIVE progression (spec §24)."""
    if current == target:
        return
    cur = _LIFECYCLE_ORDER[current]
    tgt = _LIFECYCLE_ORDER[target]
    if tgt < cur:
        raise InvalidLifecycleTransition(f"Cannot move backwards: {current.value} -> {target.value}")
    if current == LifecycleStage.DRAFT and target == LifecycleStage.LIVE and not privileged_override:
        raise InvalidLifecycleTransition(
            "DRAFT -> LIVE is forbidden without a privileged, audit-logged override"
        )


class Agent(BaseModel):
    """A governed autonomous agent (spec §23)."""

    model_config = ConfigDict(frozen=True)

    agent_id: str
    name: str
    manifest_id: str | None = None
    autonomy_level: AutonomyLevel = AutonomyLevel.RESEARCH
    lifecycle_stage: LifecycleStage = LifecycleStage.DRAFT
    capital: AgentCapital = Field(default_factory=AgentCapital)

    @property
    def can_create_orders(self) -> bool:
        return self.autonomy_level not in {AutonomyLevel.RESEARCH, AutonomyLevel.SUGGEST}

    @property
    def requires_human_approval(self) -> bool:
        return (
            self.autonomy_level
            in {
                AutonomyLevel.CONFIRM,
                AutonomyLevel.SUGGEST,
            }
            or self.capital.requires_approval
        )

    def advance(self, target: LifecycleStage, privileged_override: bool = False) -> Agent:
        validate_lifecycle_transition(self.lifecycle_stage, target, privileged_override)
        return self.model_copy(update={"lifecycle_stage": target})
