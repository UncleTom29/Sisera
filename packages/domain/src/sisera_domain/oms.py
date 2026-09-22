"""Order Management System core (ADR-006).

An in-memory OMS that enforces idempotency by `client_order_id` and owns the order state
machine. The `services/oms` service will wrap this with persistence and the venue router;
this module is the pure domain core.
"""

from __future__ import annotations

import time
import uuid
from decimal import Decimal

from sisera_domain.order import Order, OrderSide, OrderState, OrderType, TimeInForce, transition_order


def _now_ms() -> int:
    return int(time.time() * 1000)


class OrderManager:
    """Idempotent order store. Duplicate client_order_id returns the existing order."""

    def __init__(self) -> None:
        self._orders: dict[str, Order] = {}
        self._client_index: dict[str, str] = {}

    def create_order(
        self,
        *,
        client_order_id: str,
        instrument_id: str,
        side: OrderSide,
        order_type: OrderType,
        quantity: Decimal,
        account_id: str,
        portfolio_id: str,
        price: Decimal | None = None,
        stop_price: Decimal | None = None,
        time_in_force: TimeInForce = TimeInForce.GTC,
        reduce_only: bool = False,
        user_id: str | None = None,
        strategy_id: str | None = None,
        agent_id: str | None = None,
    ) -> Order:
        """Create a new order, enforcing idempotency on `client_order_id`.

        If an order with the same `client_order_id` already exists, it is returned as-is
        (no duplicate order is created). This is the mechanism that guarantees a retried
        submission cannot produce duplicate trades.
        """
        existing = self._client_index.get(client_order_id)
        if existing is not None:
            return self._orders[existing]

        now = _now_ms()
        order = Order(
            sisera_order_id=f"sis_{uuid.uuid4().hex}",
            client_order_id=client_order_id,
            instrument_id=instrument_id,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price,
            time_in_force=time_in_force,
            reduce_only=reduce_only,
            account_id=account_id,
            portfolio_id=portfolio_id,
            user_id=user_id,
            strategy_id=strategy_id,
            agent_id=agent_id,
            created_at_ms=now,
            updated_at_ms=now,
        )
        self._orders[order.sisera_order_id] = order
        self._client_index[client_order_id] = order.sisera_order_id
        return order

    def get(self, sisera_order_id: str) -> Order:
        return self._orders[sisera_order_id]

    def by_client_order_id(self, client_order_id: str) -> Order | None:
        sid = self._client_index.get(client_order_id)
        return self._orders[sid] if sid is not None else None

    def advance(self, sisera_order_id: str, target: OrderState, note: str | None = None) -> Order:
        current = self._orders[sisera_order_id]
        advanced = transition_order(current, target, _now_ms(), note)
        self._orders[sisera_order_id] = advanced
        return advanced

    def record_fill(
        self,
        sisera_order_id: str,
        fill_quantity: Decimal,
        fill_price: Decimal,
    ) -> Order:
        current = self._orders[sisera_order_id]
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
        self._orders[sisera_order_id] = advanced
        return advanced

    def __len__(self) -> int:
        return len(self._orders)
