"""Order Management System domain (ADR-006, spec §12).

The canonical order aggregate and its state machine. This is the single source of truth for
order lifecycle; the venue adapters (connectors) translate to/from this model. Idempotency
is enforced by `client_order_id`: a duplicate submission must not create a duplicate trade.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.money import Asset, Money


class OrderSide(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(StrEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    POST_ONLY = "POST_ONLY"
    REDUCE_ONLY = "REDUCE_ONLY"
    IOC = "IOC"
    FOK = "FOK"
    STOP = "STOP"
    STOP_LIMIT = "STOP_LIMIT"
    TAKE_PROFIT = "TAKE_PROFIT"
    TRAILING_STOP = "TRAILING_STOP"
    OCO = "OCO"
    BRACKET = "BRACKET"


class TimeInForce(StrEnum):
    GTC = "GTC"
    IOC = "IOC"
    FOK = "FOK"
    POST_ONLY = "POST_ONLY"


class OrderState(StrEnum):
    CREATED = "CREATED"
    VALIDATING = "VALIDATING"
    RISK_CHECK = "RISK_CHECK"
    RISK_REJECTED = "RISK_REJECTED"
    APPROVAL_PENDING = "APPROVAL_PENDING"
    APPROVED = "APPROVED"
    ROUTING = "ROUTING"
    SUBMITTING = "SUBMITTING"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCEL_PENDING = "CANCEL_PENDING"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    UNKNOWN = "UNKNOWN"


# Allowed state transitions (ADR-006). Terminal states have no outgoing edges.
_TRANSITIONS: dict[OrderState, frozenset[OrderState]] = {
    OrderState.CREATED: frozenset({OrderState.VALIDATING}),
    OrderState.VALIDATING: frozenset({OrderState.RISK_CHECK, OrderState.REJECTED}),
    OrderState.RISK_CHECK: frozenset(
        {OrderState.RISK_REJECTED, OrderState.APPROVAL_PENDING, OrderState.ROUTING}
    ),
    OrderState.RISK_REJECTED: frozenset(),
    OrderState.APPROVAL_PENDING: frozenset({OrderState.APPROVED, OrderState.REJECTED}),
    OrderState.APPROVED: frozenset({OrderState.ROUTING}),
    OrderState.ROUTING: frozenset({OrderState.SUBMITTING, OrderState.REJECTED}),
    OrderState.SUBMITTING: frozenset({OrderState.ACKNOWLEDGED, OrderState.REJECTED, OrderState.UNKNOWN}),
    OrderState.ACKNOWLEDGED: frozenset(
        {
            OrderState.PARTIALLY_FILLED,
            OrderState.FILLED,
            OrderState.CANCEL_PENDING,
            OrderState.EXPIRED,
        }
    ),
    OrderState.PARTIALLY_FILLED: frozenset(
        {OrderState.PARTIALLY_FILLED, OrderState.FILLED, OrderState.CANCEL_PENDING, OrderState.EXPIRED}
    ),
    OrderState.FILLED: frozenset(),
    OrderState.CANCEL_PENDING: frozenset(
        {OrderState.CANCELLED, OrderState.PARTIALLY_FILLED, OrderState.FILLED}
    ),
    OrderState.CANCELLED: frozenset(),
    OrderState.REJECTED: frozenset(),
    OrderState.EXPIRED: frozenset(),
    OrderState.UNKNOWN: frozenset(
        {
            OrderState.ACKNOWLEDGED,
            OrderState.PARTIALLY_FILLED,
            OrderState.FILLED,
            OrderState.CANCELLED,
            OrderState.REJECTED,
            OrderState.EXPIRED,
        }
    ),
}

_TERMINAL_STATES: frozenset[OrderState] = frozenset(
    {
        OrderState.RISK_REJECTED,
        OrderState.FILLED,
        OrderState.CANCELLED,
        OrderState.REJECTED,
        OrderState.EXPIRED,
    }
)


class StateTransition(BaseModel):
    model_config = ConfigDict(frozen=True)

    from_state: OrderState
    to_state: OrderState
    timestamp_ms: int
    note: str | None = None


class Order(BaseModel):
    """Canonical order aggregate (spec §12)."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=False)

    sisera_order_id: str
    client_order_id: str
    instrument_id: str
    side: OrderSide
    order_type: OrderType
    quantity: Decimal
    quantity_asset: Asset | None = None
    price: Decimal | None = None
    stop_price: Decimal | None = None
    time_in_force: TimeInForce = TimeInForce.GTC
    reduce_only: bool = False
    state: OrderState = OrderState.CREATED
    venue_order_id: str | None = None
    filled_quantity: Decimal = Decimal("0")
    avg_fill_price: Decimal | None = None
    fee_paid: Money | None = None
    account_id: str
    portfolio_id: str
    user_id: str | None = None
    strategy_id: str | None = None
    agent_id: str | None = None
    risk_decision_id: str | None = None
    approval_decision_id: str | None = None
    created_at_ms: int = 0
    updated_at_ms: int = 0
    lifecycle: tuple[StateTransition, ...] = Field(default_factory=tuple)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def is_terminal(self) -> bool:
        return self.state in _TERMINAL_STATES

    @property
    def remaining_quantity(self) -> Decimal:
        return self.quantity - self.filled_quantity


class InvalidStateTransition(ValueError):
    """Raised when an order attempts an illegal state transition."""


class OrderStateMachine:
    """Pure transition validation. The `Order` aggregate enforces this on mutation."""

    @staticmethod
    def can_transition(current: OrderState, target: OrderState) -> bool:
        return target in _TRANSITIONS.get(current, frozenset())

    @staticmethod
    def assert_transition(current: OrderState, target: OrderState) -> None:
        if not OrderStateMachine.can_transition(current, target):
            raise InvalidStateTransition(
                f"Illegal order state transition {current.value} -> {target.value}"
            )

    @staticmethod
    def terminal_states() -> frozenset[OrderState]:
        return _TERMINAL_STATES


def transition_order(
    order: Order, target: OrderState, timestamp_ms: int, note: str | None = None
) -> Order:
    """Return a new immutable Order advanced to `target`, appending a lifecycle entry."""
    if order.is_terminal:
        raise InvalidStateTransition(f"Order {order.sisera_order_id} is already terminal")
    OrderStateMachine.assert_transition(order.state, target)
    transition = StateTransition(
        from_state=order.state, to_state=target, timestamp_ms=timestamp_ms, note=note
    )
    return order.model_copy(
        update={
            "state": target,
            "updated_at_ms": timestamp_ms,
            "lifecycle": order.lifecycle + (transition,),
        }
    )
