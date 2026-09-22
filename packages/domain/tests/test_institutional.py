"""Tests for institutional controls: approvals, kill switches, reconciliation, intents."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sisera_domain import (
    ApprovalEngine,
    ApprovalPolicy,
    ApprovalRule,
    CircuitBreaker,
    EmergencyMode,
    IntentAction,
    InvalidIntent,
    KillScope,
    Reconciler,
    TradeIntent,
    TriggerType,
    compile_intent,
)

# --------------------------------------------------------------------------- #
# Approvals
# --------------------------------------------------------------------------- #


def _policy() -> ApprovalPolicy:
    return ApprovalPolicy(
        policy_id="p1",
        rules=(
            ApprovalRule(
                rule_id="large",
                min_notional=Decimal("100000"),
                required_roles=("TRADER", "PORTFOLIO_MANAGER"),
                required_approvals=2,
            ),
        ),
    )


def test_small_order_needs_no_approval() -> None:
    engine = ApprovalEngine(_policy())
    request = engine.evaluate("o1", "trader_1", Decimal("1000"))
    assert request.triggered_rules == ()
    assert engine.is_approved(request.request_id) is True


def test_large_order_requires_four_eyes() -> None:
    engine = ApprovalEngine(_policy())
    request = engine.evaluate("o1", "trader_1", Decimal("150000"))
    assert request.triggered_rules == ("large",)
    assert engine.is_approved(request.request_id) is False

    engine.approve(request.request_id, "trader_1", "TRADER")
    assert engine.is_approved(request.request_id) is False
    engine.approve(request.request_id, "pm_1", "PORTFOLIO_MANAGER")
    assert engine.is_approved(request.request_id) is True


def test_rejection_blocks() -> None:
    engine = ApprovalEngine(_policy())
    request = engine.evaluate("o1", "trader_1", Decimal("150000"))
    engine.approve(request.request_id, "trader_1", "TRADER")
    engine.approve(request.request_id, "pm_1", "PORTFOLIO_MANAGER", approved=False)
    assert engine.is_approved(request.request_id) is False


# --------------------------------------------------------------------------- #
# Kill switches
# --------------------------------------------------------------------------- #


def test_global_trip_blocks_portfolio() -> None:
    cb = CircuitBreaker()
    cb.trip(KillScope.GLOBAL, "global", EmergencyMode.BLOCK_NEW_ORDERS, "vol spike", "risk")
    assert cb.is_blocked(KillScope.PORTFOLIO, "pf_1") is True
    assert cb.is_blocked(KillScope.AGENT, "agent_1") is True


def test_narrow_trip_blocks_only_itself() -> None:
    cb = CircuitBreaker()
    cb.trip(KillScope.PORTFOLIO, "pf_1", EmergencyMode.REDUCE_ONLY, "drawdown", "risk")
    assert cb.is_blocked(KillScope.PORTFOLIO, "pf_1") is True
    assert cb.is_blocked(KillScope.PORTFOLIO, "pf_2") is False


def test_clear_restores() -> None:
    cb = CircuitBreaker()
    cb.trip(KillScope.VENUE, "bybit", EmergencyMode.BLOCK_NEW_ORDERS, "outage", "ops")
    assert cb.is_blocked(KillScope.VENUE, "bybit") is True
    cb.clear(KillScope.VENUE, "bybit", "ops")
    assert cb.is_blocked(KillScope.VENUE, "bybit") is False
    assert cb.active_switches() == []


# --------------------------------------------------------------------------- #
# Reconciliation
# --------------------------------------------------------------------------- #


def test_matching_balances_produce_no_discrepancy() -> None:
    r = Reconciler()
    assert r.reconcile_balances("a", {"USDT": Decimal("100")}, {"USDT": Decimal("100")}) == []


def test_divergent_balance_is_flagged_not_silently_fixed() -> None:
    r = Reconciler(tolerance=Decimal("0.01"))
    out = r.reconcile_balances("a", {"USDT": Decimal("100")}, {"USDT": Decimal("90")})
    assert len(out) == 1
    assert out[0].breached is True
    assert out[0].difference == Decimal("10")


def test_position_reconciliation() -> None:
    r = Reconciler()
    out = r.reconcile_positions({"btc": Decimal("1")}, {"btc": Decimal("0.9")})
    assert len(out) == 1
    assert out[0].field == "position_quantity"


# --------------------------------------------------------------------------- #
# Intent compiler
# --------------------------------------------------------------------------- #


def test_compile_valid_intent() -> None:
    intent = compile_intent(
        {
            "instrument": "ETH",
            "action": "BUY",
            "notional": "20000",
            "trigger": {"type": "BREAKOUT", "reference": "TODAY_HIGH"},
            "funding_percentile_max": "80",
            "portfolio_risk_fraction": "0.005",
        }
    )
    assert intent.action == IntentAction.BUY
    assert intent.trigger.type == TriggerType.BREAKOUT
    assert intent.portfolio_risk_fraction == Decimal("0.005")


def test_invalid_intent_rejected() -> None:
    with pytest.raises(InvalidIntent):
        compile_intent({"instrument": "ETH", "action": "BUY"})  # missing qty/notional
    with pytest.raises(InvalidIntent):
        compile_intent({"instrument": "ETH", "action": "HODL", "notional": "1"})
    with pytest.raises(ValidationError):
        TradeIntent(instrument="ETH", action="BUY", notional=Decimal("-1"))


def test_intent_has_no_execution_authority() -> None:
    # A TradeIntent is data, not an order. It carries no venue, no signature, no approval.
    intent = compile_intent({"instrument": "ETH", "action": "BUY", "notional": "1"})
    assert not hasattr(intent, "venue_order_id")
    assert not hasattr(intent, "place")
