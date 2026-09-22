"""OMS repository: persists orders and their lifecycle, enforcing idempotency and the
canonical state machine (ADR-006)."""

from __future__ import annotations

import time
from decimal import Decimal

from sisera_domain.money import Asset, Money
from sisera_domain.order import (
    Order,
    OrderSide,
    OrderState,
    OrderType,
    StateTransition,
    TimeInForce,
    transition_order,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sisera_oms.models import OrderLifecycleRow, OrderRow


def _now_ms() -> int:
    return int(time.time() * 1000)


def order_to_row(order: Order) -> OrderRow:
    return OrderRow(
        sisera_order_id=order.sisera_order_id,
        client_order_id=order.client_order_id,
        instrument_id=order.instrument_id,
        side=order.side.value,
        order_type=order.order_type.value,
        quantity=order.quantity,
        quantity_asset=order.quantity_asset.code if order.quantity_asset else None,
        price=order.price,
        stop_price=order.stop_price,
        time_in_force=order.time_in_force.value,
        reduce_only=order.reduce_only,
        state=order.state.value,
        venue_order_id=order.venue_order_id,
        filled_quantity=order.filled_quantity,
        avg_fill_price=order.avg_fill_price,
        fee_amount=order.fee_paid.amount if order.fee_paid else None,
        fee_asset=order.fee_paid.asset.code if order.fee_paid else None,
        account_id=order.account_id,
        portfolio_id=order.portfolio_id,
        user_id=order.user_id,
        strategy_id=order.strategy_id,
        agent_id=order.agent_id,
        risk_decision_id=order.risk_decision_id,
        approval_decision_id=order.approval_decision_id,
        created_at_ms=order.created_at_ms,
        updated_at_ms=order.updated_at_ms,
        metadata_json=order.metadata or None,
        lifecycle=[
            OrderLifecycleRow(
                from_state=t.from_state.value,
                to_state=t.to_state.value,
                timestamp_ms=t.timestamp_ms,
                note=t.note,
            )
            for t in order.lifecycle
        ],
    )


def row_to_order(row: OrderRow) -> Order:
    return Order(
        sisera_order_id=row.sisera_order_id,
        client_order_id=row.client_order_id,
        instrument_id=row.instrument_id,
        side=OrderSide(row.side),
        order_type=OrderType(row.order_type),
        quantity=Decimal(row.quantity),
        quantity_asset=Asset(row.quantity_asset) if row.quantity_asset else None,
        price=Decimal(row.price) if row.price is not None else None,
        stop_price=Decimal(row.stop_price) if row.stop_price is not None else None,
        time_in_force=TimeInForce(row.time_in_force),
        reduce_only=row.reduce_only,
        state=OrderState(row.state),
        venue_order_id=row.venue_order_id,
        filled_quantity=Decimal(row.filled_quantity),
        avg_fill_price=Decimal(row.avg_fill_price) if row.avg_fill_price is not None else None,
        fee_paid=(
            Money(Decimal(row.fee_amount), Asset(row.fee_asset))
            if row.fee_amount is not None and row.fee_asset is not None
            else None
        ),
        account_id=row.account_id,
        portfolio_id=row.portfolio_id,
        user_id=row.user_id,
        strategy_id=row.strategy_id,
        agent_id=row.agent_id,
        risk_decision_id=row.risk_decision_id,
        approval_decision_id=row.approval_decision_id,
        created_at_ms=row.created_at_ms,
        updated_at_ms=row.updated_at_ms,
        lifecycle=tuple(
            StateTransition(
                from_state=OrderState(t.from_state),
                to_state=OrderState(t.to_state),
                timestamp_ms=t.timestamp_ms,
                note=t.note,
            )
            for t in row.lifecycle
        ),
        metadata=row.metadata_json or {},
    )


class OrderRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def save(self, order: Order) -> Order:
        """Insert or update an order. Duplicate `client_order_id` returns the existing
        order unchanged (database-enforced idempotency)."""
        existing = self._session.get(OrderRow, order.sisera_order_id)
        if existing is not None:
            return row_to_order(existing)

        self._session.add(order_to_row(order))
        try:
            self._session.flush()
        except IntegrityError:
            self._session.rollback()
            # Either the sisera_order_id or (more likely) client_order_id collided.
            existing = self._session.get(OrderRow, order.sisera_order_id)
            if existing is not None:
                return row_to_order(existing)
            collided = self._session.scalars(
                select(OrderRow).where(OrderRow.client_order_id == order.client_order_id)
            ).first()
            if collided is not None:
                return row_to_order(collided)
            raise
        return order

    def get(self, sisera_order_id: str) -> Order | None:
        row = self._session.get(OrderRow, sisera_order_id)
        return row_to_order(row) if row is not None else None

    def by_client_order_id(self, client_order_id: str) -> Order | None:
        row = self._session.scalars(
            select(OrderRow).where(OrderRow.client_order_id == client_order_id)
        ).first()
        return row_to_order(row) if row is not None else None

    def advance(self, sisera_order_id: str, target: OrderState, note: str | None = None) -> Order:
        current = self.get(sisera_order_id)
        if current is None:
            raise KeyError(f"Unknown order {sisera_order_id!r}")
        advanced = transition_order(current, target, _now_ms(), note)
        row = self._session.get(OrderRow, sisera_order_id)
        row.state = advanced.state.value
        row.updated_at_ms = advanced.updated_at_ms
        row.lifecycle.append(
            OrderLifecycleRow(
                from_state=current.state.value,
                to_state=target.value,
                timestamp_ms=advanced.updated_at_ms,
                note=note,
            )
        )
        self._session.flush()
        return advanced

    def record_fill(self, sisera_order_id: str, fill_quantity: Decimal, fill_price: Decimal) -> Order:
        current = self.get(sisera_order_id)
        if current is None:
            raise KeyError(f"Unknown order {sisera_order_id!r}")
        new_filled = current.filled_quantity + fill_quantity
        target = OrderState.FILLED if new_filled >= current.quantity else OrderState.PARTIALLY_FILLED
        updated = current.model_copy(
            update={
                "filled_quantity": new_filled,
                "avg_fill_price": fill_price,
                "updated_at_ms": _now_ms(),
            }
        )
        advanced = transition_order(updated, target, _now_ms(), note=f"fill {fill_quantity}")
        row = self._session.get(OrderRow, sisera_order_id)
        row.filled_quantity = new_filled
        row.avg_fill_price = fill_price
        row.state = advanced.state.value
        row.updated_at_ms = advanced.updated_at_ms
        row.lifecycle.append(
            OrderLifecycleRow(
                from_state=current.state.value,
                to_state=target.value,
                timestamp_ms=advanced.updated_at_ms,
                note=f"fill {fill_quantity}",
            )
        )
        self._session.flush()
        return advanced
