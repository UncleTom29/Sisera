"""Canonical order lifecycle events (ADR-006, spec §12)."""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from sisera_schemas.common import EventHeader


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


class OrderCreated(EventHeader):
    sisera_order_id: str
    client_order_id: str
    account_id: str
    portfolio_id: str
    side: str  # "buy" | "sell"
    order_type: str
    quantity: Decimal
    price: Decimal | None = None
    time_in_force: str = "GTC"
    strategy_id: str | None = None
    agent_id: str | None = None
    user_id: str | None = None


class OrderSubmitted(EventHeader):
    sisera_order_id: str
    venue_order_id: str | None = None


class OrderAcknowledged(EventHeader):
    sisera_order_id: str
    venue_order_id: str | None = None


class FillEvent(EventHeader):
    sisera_order_id: str
    fill_id: str
    quantity: Decimal
    price: Decimal
    fee: Decimal = Decimal("0")
    fee_asset: str | None = None


class OrderCancelled(EventHeader):
    sisera_order_id: str


class OrderRejected(EventHeader):
    sisera_order_id: str
    reason: str
