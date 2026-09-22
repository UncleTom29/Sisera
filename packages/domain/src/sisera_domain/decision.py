"""Decision Ledger domain (spec §18).

Structured, queryable provenance for every material AI/strategy/agent/execution decision.
Immutable once written. Answers "why did Sisera enter this trade?", "why was this rejected?",
"which signals have degraded?", and "what would have happened if a rejected trade had been
taken?" (counterfactual). Complements the *financial* ledger (ADR-007) — this is provenance,
not accounting.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DecisionKind(StrEnum):
    TRADE = "TRADE"
    PROBE = "PROBE"
    WAIT = "WAIT"
    NO_TRADE = "NO_TRADE"
    REDUCE = "REDUCE"
    EXIT = "EXIT"
    REJECTED = "REJECTED"


class SignalComponent(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    value: Decimal
    weight: Decimal = Decimal("0")
    family: str | None = None


class Decision(BaseModel):
    """A single decision with full structured provenance (spec §18)."""

    model_config = ConfigDict(frozen=True)

    decision_id: str
    timestamp_ms: int
    instrument_id: str | None = None
    symbol: str | None = None
    direction: str | None = None
    kind: DecisionKind
    market_snapshot_id: str | None = None
    portfolio_snapshot_id: str | None = None
    strategy_version: str | None = None
    model_version: str | None = None
    risk_policy_version: str | None = None
    execution_policy_version: str | None = None
    features: dict[str, Decimal] = Field(default_factory=dict)
    signal_components: tuple[SignalComponent, ...] = Field(default_factory=tuple)
    confidence: Decimal = Decimal("0")
    expected_value: Decimal = Decimal("0")
    uncertainty: Decimal = Decimal("0")
    regime: str | None = None
    reason_codes: tuple[str, ...] = Field(default_factory=tuple)
    trade_plan: dict[str, Any] = Field(default_factory=dict)
    risk_result: dict[str, Any] = Field(default_factory=dict)
    approval_result: dict[str, Any] = Field(default_factory=dict)
    route_plan: dict[str, Any] = Field(default_factory=dict)
    fills: tuple[dict[str, Any], ...] = Field(default_factory=tuple)
    outcome: str | None = None
    counterfactual: str | None = None
    attribution: dict[str, Any] = Field(default_factory=dict)


class DecisionLedger:
    """Append-only, queryable decision provenance store."""

    def __init__(self) -> None:
        self._decisions: dict[str, Decision] = {}

    def record(self, decision: Decision) -> Decision:
        if decision.decision_id in self._decisions:
            raise ValueError(f"Duplicate decision id {decision.decision_id!r}")
        self._decisions[decision.decision_id] = decision
        return decision

    def get(self, decision_id: str) -> Decision:
        return self._decisions[decision_id]

    def query(
        self,
        *,
        instrument_id: str | None = None,
        symbol: str | None = None,
        kind: DecisionKind | None = None,
        limit: int = 100,
    ) -> tuple[Decision, ...]:
        results = []
        for d in self._decisions.values():
            if instrument_id is not None and d.instrument_id != instrument_id:
                continue
            if symbol is not None and d.symbol != symbol:
                continue
            if kind is not None and d.kind != kind:
                continue
            results.append(d)
        results.sort(key=lambda d: d.timestamp_ms, reverse=True)
        return tuple(results[:limit])

    def counterfactuals(self, kind: DecisionKind | None = None) -> tuple[Decision, ...]:
        """Decisions that have a settled counterfactual verdict."""
        return tuple(
            d
            for d in self._decisions.values()
            if d.counterfactual is not None and (kind is None or d.kind == kind)
        )

    def __len__(self) -> int:
        return len(self._decisions)
