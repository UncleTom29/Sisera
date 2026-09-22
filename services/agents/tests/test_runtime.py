"""Tests for the agent runtime (spec §60 golden workflow)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_agents import AgentBlocked, AgentRuntime
from sisera_domain import (
    Agent,
    AgentCapital,
    ApprovalEngine,
    ApprovalPolicy,
    ApprovalRule,
    Asset,
    AutonomyLevel,
    DecisionKind,
    LifecycleStage,
    MarketView,
    Money,
    OpportunityStructure,
    Portfolio,
)


def _portfolio() -> Portfolio:
    return Portfolio(
        portfolio_id="pf_1",
        name="Main",
        quote_asset=Asset("USDT"),
        cash={"USDT": Money("100000", Asset("USDT"))},
        peak_equity=Decimal("100000"),
    )


def _view() -> MarketView:
    return MarketView(
        instrument_id="btc",
        mid_price=Decimal("60000"),
        signal=Decimal("0.8"),
        confidence=Decimal("0.65"),
        uncertainty=Decimal("0.15"),
        expected_move=Decimal("0.04"),
        stop_distance=Decimal("0.02"),
        liquidity_score=Decimal("0.9"),
    )


def _agent(**overrides: object) -> Agent:
    base: dict[str, object] = {
        "agent_id": "a1",
        "name": "momentum",
        "autonomy_level": AutonomyLevel.POLICY_AUTO,
        "lifecycle_stage": LifecycleStage.PAPER,
        "capital": AgentCapital(
            capital=Decimal("10000"),
            max_position_notional=Decimal("50000"),
            requires_approval=False,
        ),
    }
    base.update(overrides)
    return Agent(**base)  # type: ignore[arg-type]


class FakePrices:
    def mark_price(self, instrument_id: str) -> Decimal | None:
        return Decimal("60000")


def test_scan_produces_opportunities() -> None:
    runtime = AgentRuntime(_agent())
    opps = runtime.scan([_view()])
    assert len(opps) == 1
    assert opps[0].structure == OpportunityStructure.DIRECTIONAL_PERP


def test_paper_execute_fills_and_records() -> None:
    runtime = AgentRuntime(_agent())
    opps = runtime.scan([_view()])
    filled = runtime.execute(opps[0], _portfolio(), FakePrices())
    assert filled is not None
    assert filled.filled_quantity > 0
    decisions = runtime.decisions.query(kind=DecisionKind.TRADE)
    assert len(decisions) == 1


def test_research_agent_cannot_execute() -> None:
    runtime = AgentRuntime(_agent(autonomy_level=AutonomyLevel.RESEARCH))
    opps = runtime.scan([_view()])
    assert runtime.execute(opps[0], _portfolio(), FakePrices()) is None
    assert len(runtime.decisions.query(kind=DecisionKind.NO_TRADE)) == 1


def test_draft_agent_blocked() -> None:
    runtime = AgentRuntime(_agent(lifecycle_stage=LifecycleStage.DRAFT))
    opps = runtime.scan([_view()])
    with pytest.raises(AgentBlocked):
        runtime.execute(opps[0], _portfolio(), FakePrices())


def test_confirm_agent_waits_for_approval() -> None:
    policy = ApprovalPolicy(
        policy_id="p1",
        rules=(
            ApprovalRule(
                rule_id="all",
                min_notional=Decimal("0"),
                required_roles=("PM",),
                required_approvals=1,
            ),
        ),
    )
    runtime = AgentRuntime(
        _agent(autonomy_level=AutonomyLevel.CONFIRM),
        approval_engine=ApprovalEngine(policy),
    )
    opps = runtime.scan([_view()])
    assert runtime.execute(opps[0], _portfolio(), FakePrices()) is None
    assert len(runtime.decisions.query(kind=DecisionKind.WAIT)) == 1


def test_no_trade_structure_not_executed() -> None:
    runtime = AgentRuntime(_agent())
    opps = runtime.scan(
        [
            MarketView(
                instrument_id="btc",
                mid_price=Decimal("60000"),
                signal=Decimal("0.01"),
                expected_move=Decimal("0.001"),
                stop_distance=Decimal("0.02"),
            )
        ]
    )
    assert opps[0].structure == OpportunityStructure.NO_TRADE
    assert runtime.execute(opps[0], _portfolio(), FakePrices()) is None
