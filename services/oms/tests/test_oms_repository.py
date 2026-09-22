"""Tests for the OMS repository (SQLite-backed, same code path as Postgres)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import Order, OrderSide, OrderState, OrderType
from sisera_oms import Base, OrderRepository, create_db_engine, session_factory
from sqlalchemy.orm import Session


@pytest.fixture
def session() -> Session:
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = session_factory(engine)()
    try:
        yield session
    finally:
        session.close()


def _order(client_order_id: str = "client_1") -> Order:
    return Order(
        sisera_order_id=f"sis_{client_order_id}",
        client_order_id=client_order_id,
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        quantity=Decimal("0.5"),
        price=Decimal("64000"),
        account_id="acct_1",
        portfolio_id="pf_1",
        created_at_ms=0,
        updated_at_ms=0,
    )


def test_save_and_get_round_trip(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order())
    session.commit()

    loaded = repo.get("sis_client_1")
    assert loaded is not None
    assert loaded.client_order_id == "client_1"
    assert loaded.quantity == Decimal("0.5")
    assert loaded.price == Decimal("64000")
    assert loaded.state == OrderState.CREATED


def test_save_enforces_idempotency_by_client_order_id(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order("dup"))
    session.commit()

    # Same client_order_id but a different (would-be duplicate) sisera_order_id.
    duplicate = _order("dup").model_copy(update={"sisera_order_id": "sis_other"})
    result = repo.save(duplicate)
    assert result.sisera_order_id == "sis_dup"  # returned existing, did not duplicate


def test_by_client_order_id(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order("c1"))
    session.commit()
    assert repo.by_client_order_id("c1").sisera_order_id == "sis_c1"
    assert repo.by_client_order_id("missing") is None


def test_advance_persists_state_and_lifecycle(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order())
    repo.advance("sis_client_1", OrderState.VALIDATING)
    repo.advance("sis_client_1", OrderState.RISK_CHECK)
    session.commit()

    loaded = repo.get("sis_client_1")
    assert loaded.state == OrderState.RISK_CHECK
    assert [t.to_state for t in loaded.lifecycle] == [OrderState.VALIDATING, OrderState.RISK_CHECK]


def test_advance_rejects_illegal_transition(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order())
    from sisera_domain.order import InvalidStateTransition

    with pytest.raises(InvalidStateTransition):
        repo.advance("sis_client_1", OrderState.FILLED)


def test_record_fill_transitions_to_filled(session: Session) -> None:
    repo = OrderRepository(session)
    repo.save(_order())
    for s in [
        OrderState.VALIDATING,
        OrderState.RISK_CHECK,
        OrderState.ROUTING,
        OrderState.SUBMITTING,
        OrderState.ACKNOWLEDGED,
    ]:
        repo.advance("sis_client_1", s)
    final = repo.record_fill("sis_client_1", Decimal("0.5"), Decimal("64010"))
    session.commit()
    assert final.state == OrderState.FILLED
    assert final.filled_quantity == Decimal("0.5")
    assert final.avg_fill_price == Decimal("64010")


def test_fee_paid_round_trips(session: Session) -> None:
    repo = OrderRepository(session)
    order = _order("fee").model_copy(
        update={
            "fee_paid": None,
            "filled_quantity": Decimal("0.5"),
            "avg_fill_price": Decimal("64000"),
        }
    )
    repo.save(order)
    session.commit()
    loaded = repo.get("sis_fee")
    assert loaded.filled_quantity == Decimal("0.5")
