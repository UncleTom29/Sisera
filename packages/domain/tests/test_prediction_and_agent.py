"""Tests for prediction markets (spec §27) and agent autonomy (spec §22–24)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sisera_domain import (
    Agent,
    AgentCapital,
    AutonomyLevel,
    InvalidLifecycleTransition,
    LifecycleStage,
    MarketKind,
    MarketStatus,
    PredictionMarket,
    PredictionOutcome,
    PredictionPosition,
    PredictionSettlement,
    ResolutionRule,
    StrategyManifest,
    settle_position,
    validate_lifecycle_transition,
)

# --------------------------------------------------------------------------- #
# Prediction markets
# --------------------------------------------------------------------------- #


def _binary_market() -> PredictionMarket:
    return PredictionMarket(
        market_id="m1",
        event_id="e1",
        kind=MarketKind.BINARY,
        outcomes=(
            PredictionOutcome(outcome_id="yes", label="Yes", probability=Decimal("0.62")),
            PredictionOutcome(outcome_id="no", label="No", probability=Decimal("0.38")),
        ),
        resolution_rule=ResolutionRule(
            rule_id="r1", description="CPI above 3.0%", resolution_source="BLS"
        ),
    )


def test_binary_market_total_probability() -> None:
    assert _binary_market().total_probability() == Decimal("1.00")


def test_probability_must_be_in_range() -> None:
    with pytest.raises(ValidationError):
        PredictionOutcome(outcome_id="x", label="x", probability=Decimal("1.5"))


def test_settle_position_pays_winner() -> None:
    pos = PredictionPosition(
        position_id="p1",
        market_id="m1",
        outcome_id="yes",
        quantity=Decimal("100"),
        avg_price=Decimal("0.62"),
    )
    settlement = PredictionSettlement(
        settlement_id="s1",
        market_id="m1",
        resolved_outcome_id="yes",
        settled_price=Decimal("1"),
        timestamp_ms=0,
    )
    assert settle_position(pos, settlement) == Decimal("100")


def test_settle_position_pays_zero_for_loser() -> None:
    pos = PredictionPosition(
        position_id="p1",
        market_id="m1",
        outcome_id="no",
        quantity=Decimal("100"),
        avg_price=Decimal("0.38"),
    )
    settlement = PredictionSettlement(
        settlement_id="s1",
        market_id="m1",
        resolved_outcome_id="yes",
        settled_price=Decimal("1"),
        timestamp_ms=0,
    )
    assert settle_position(pos, settlement) == Decimal("0")


def test_settle_position_mismatched_market_raises() -> None:
    pos = PredictionPosition(
        position_id="p1",
        market_id="m1",
        outcome_id="yes",
        quantity=Decimal("1"),
        avg_price=Decimal("0.5"),
    )
    settlement = PredictionSettlement(
        settlement_id="s1",
        market_id="other",
        resolved_outcome_id="yes",
        settled_price=Decimal("1"),
        timestamp_ms=0,
    )
    with pytest.raises(ValueError):
        settle_position(pos, settlement)


def test_market_status_defaults_open() -> None:
    assert _binary_market().status == MarketStatus.OPEN


# --------------------------------------------------------------------------- #
# Agents
# --------------------------------------------------------------------------- #


def test_autonomy_can_create_orders_only_beyond_research_suggest() -> None:
    r = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.RESEARCH)
    assert r.can_create_orders is False
    s = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.SUGGEST)
    assert s.can_create_orders is False
    p = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.POLICY_AUTO)
    assert p.can_create_orders is True
    auto = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.AUTONOMOUS)
    assert auto.can_create_orders is True


def test_confirm_requires_human_approval() -> None:
    a = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.CONFIRM)
    assert a.requires_human_approval is True
    auto = Agent(
        agent_id="a",
        name="x",
        autonomy_level=AutonomyLevel.AUTONOMOUS,
        capital=AgentCapital(capital=Decimal("1000"), requires_approval=False),
    )
    assert auto.requires_human_approval is False
    # Conservative default: even AUTONOMOUS requires approval unless explicitly cleared.
    bare_auto = Agent(agent_id="a", name="x", autonomy_level=AutonomyLevel.AUTONOMOUS)
    assert bare_auto.requires_human_approval is True


def test_draft_to_live_is_forbidden_without_override() -> None:
    with pytest.raises(InvalidLifecycleTransition):
        validate_lifecycle_transition(LifecycleStage.DRAFT, LifecycleStage.LIVE)


def test_draft_to_live_allowed_with_privileged_override() -> None:
    validate_lifecycle_transition(LifecycleStage.DRAFT, LifecycleStage.LIVE, privileged_override=True)


def test_backwards_transition_forbidden() -> None:
    with pytest.raises(InvalidLifecycleTransition):
        validate_lifecycle_transition(LifecycleStage.LIVE, LifecycleStage.PAPER)


def test_agent_advance_returns_new_immutable_instance() -> None:
    a = Agent(agent_id="a", name="x")
    b = a.advance(LifecycleStage.BACKTEST)
    assert b.lifecycle_stage == LifecycleStage.BACKTEST
    assert a.lifecycle_stage == LifecycleStage.DRAFT


def test_strategy_manifest_is_versioned_and_immutable() -> None:
    m = StrategyManifest(
        manifest_id="m1",
        name="btc-eth-momentum",
        universe={"instruments": ["BTC", "ETH"]},
        risk={"risk_per_trade": 0.005, "max_daily_drawdown": 0.03},
        autonomy={"entry": "AUTO", "exit": "AUTO"},
    )
    assert m.version == 1
    with pytest.raises(ValidationError):
        m.name = "changed"  # type: ignore[misc]


def test_agent_capital_constraints() -> None:
    cap = AgentCapital(capital=Decimal("10000"), max_leverage=Decimal("3"), max_drawdown=Decimal("0.05"))
    assert cap.max_leverage == Decimal("3")
    assert cap.requires_approval is True
