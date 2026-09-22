"""Tests for the settlement worker (execution -> double-entry ledger)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import (
    Asset,
    Money,
    Order,
    OrderSide,
    OrderType,
    PredictionPosition,
    PredictionSettlement,
)
from sisera_ledger import Base, LedgerRepository, create_db_engine, session_factory
from sisera_settlement import SettlementJob
from sqlalchemy.orm import Session


@pytest.fixture
def ledger() -> LedgerRepository:
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session: Session = session_factory(engine)()
    return LedgerRepository(session)


def _filled_buy() -> Order:
    return Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        filled_quantity=Decimal("1"),
        avg_fill_price=Decimal("60000"),
        fee_paid=Money(Decimal("36"), Asset("USDT")),
        account_id="a",
        portfolio_id="p",
    )


def test_settle_buy_fill_is_balanced(ledger: LedgerRepository) -> None:
    job = SettlementJob(ledger)
    entry = job.settle_fill(_filled_buy(), base_asset="BTC", quote_asset="USDT")
    assert entry.entry_type == "FILL"
    # Cash paid notional + fee; inventory gained 1 BTC.
    assert ledger.balance("cash", "USDT") == Decimal("-60036")
    assert ledger.balance("inventory", "BTC") == Decimal("1")
    assert ledger.balance("fee_account", "USDT") == Decimal("36")


def test_settle_sell_fill(ledger: LedgerRepository) -> None:
    order = _filled_buy().model_copy(
        update={"side": OrderSide.SELL, "fee_paid": Money(Decimal("36"), Asset("USDT"))}
    )
    job = SettlementJob(ledger)
    job.settle_fill(order, base_asset="BTC", quote_asset="USDT")
    assert ledger.balance("cash", "USDT") == Decimal("59964")
    assert ledger.balance("inventory", "BTC") == Decimal("-1")


def test_settle_unfilled_raises(ledger: LedgerRepository) -> None:
    order = _filled_buy().model_copy(update={"filled_quantity": Decimal("0"), "avg_fill_price": None})
    with pytest.raises(ValueError):
        SettlementJob(ledger).settle_fill(order, base_asset="BTC", quote_asset="USDT")


def test_settle_prediction_payout(ledger: LedgerRepository) -> None:
    position = PredictionPosition(
        position_id="p1", market_id="m1", outcome_id="yes",
        quantity=Decimal("100"), avg_price=Decimal("0.62"),
    )
    settlement = PredictionSettlement(
        settlement_id="s1", market_id="m1", resolved_outcome_id="yes",
        settled_price=Decimal("1"), timestamp_ms=0,
    )
    job = SettlementJob(ledger)
    job.settle_prediction(position, settlement)
    assert ledger.balance("cash", "USDC") == Decimal("100")
