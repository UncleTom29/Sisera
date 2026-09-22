"""Tests for the OMS order domain (ADR-006)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError
from sisera_domain import Order, OrderSide, OrderState, OrderType
from sisera_domain.order import (
    InvalidStateTransition,
    OrderStateMachine,
    transition_order,
)


def _order(state: OrderState = OrderState.CREATED) -> Order:
    return Order(
        sisera_order_id="ord_1",
        client_order_id="client_1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        quantity=Decimal("0.5"),
        price=Decimal("64000"),
        account_id="acct_1",
        portfolio_id="pf_1",
        state=state,
    )


def test_full_lifecycle_transitions_are_valid() -> None:
    o = _order()
    for target in [
        OrderState.VALIDATING,
        OrderState.RISK_CHECK,
        OrderState.ROUTING,
        OrderState.SUBMITTING,
        OrderState.ACKNOWLEDGED,
        OrderState.PARTIALLY_FILLED,
        OrderState.FILLED,
    ]:
        o = transition_order(o, target, timestamp_ms=0)
    assert o.state == OrderState.FILLED
    assert o.is_terminal is True
    assert [t.to_state for t in o.lifecycle][-1] == OrderState.FILLED


def test_terminal_state_cannot_transition() -> None:
    o = _order(OrderState.FILLED)
    with pytest.raises(InvalidStateTransition):
        transition_order(o, OrderState.CANCELLED, timestamp_ms=0)


def test_illegal_transition_rejected() -> None:
    o = _order(OrderState.CREATED)
    # CREATED -> FILLED is not allowed.
    with pytest.raises(InvalidStateTransition):
        transition_order(o, OrderState.FILLED, timestamp_ms=0)


def test_risk_check_can_reject_or_route() -> None:
    assert OrderStateMachine.can_transition(OrderState.RISK_CHECK, OrderState.RISK_REJECTED)
    assert OrderStateMachine.can_transition(OrderState.RISK_CHECK, OrderState.ROUTING)
    assert OrderStateMachine.can_transition(OrderState.RISK_CHECK, OrderState.APPROVAL_PENDING)


def test_terminal_states_have_no_outgoing() -> None:
    for s in OrderStateMachine.terminal_states():
        assert OrderStateMachine.can_transition(s, OrderState.CREATED) is False


def test_remaining_quantity() -> None:
    o = _order().model_copy(update={"filled_quantity": Decimal("0.3")})
    assert o.remaining_quantity == Decimal("0.2")


@given(st.sampled_from(list(OrderState)))
def test_self_transition_is_never_allowed_except_partial(state: OrderState) -> None:
    # PARTIALLY_FILLED -> PARTIALLY_FILLED is allowed (multiple fills); no other
    # self-transition is meaningful.
    can = OrderStateMachine.can_transition(state, state)
    if state == OrderState.PARTIALLY_FILLED:
        assert can is True
    else:
        assert can is False


def test_order_is_immutable() -> None:
    o = _order()
    with pytest.raises(ValidationError):
        o.state = OrderState.FILLED  # type: ignore[misc]
