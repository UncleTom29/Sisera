"""Tests for the portfolio repository."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import Asset, Money, OrderSide, Portfolio, Position
from sisera_portfolio import Base, PortfolioRepository, create_db_engine, session_factory
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


def _portfolio() -> Portfolio:
    return Portfolio(
        portfolio_id="pf_1",
        name="Main",
        quote_asset=Asset("USDT"),
        cash={"USDT": Money("100000", Asset("USDT"))},
        peak_equity=Decimal("100000"),
    )


def test_portfolio_and_cash_round_trip(session: Session) -> None:
    repo = PortfolioRepository(session)
    repo.save_portfolio(_portfolio())
    repo.set_cash("pf_1", Asset("USDT"), Decimal("100000"))
    session.commit()

    loaded = repo.get_portfolio("pf_1")
    assert loaded is not None
    assert loaded.name == "Main"
    assert loaded.quote_asset == Asset("USDT")
    assert loaded.cash["USDT"].amount == Decimal("100000")


def test_position_upsert_and_load(session: Session) -> None:
    repo = PortfolioRepository(session)
    repo.save_portfolio(_portfolio())
    repo.upsert_position(
        "pf_1",
        Position(
            instrument_id="bybit_btc_perp",
            side=OrderSide.BUY,
            quantity=Decimal("1"),
            entry_price=Decimal("60000"),
            mark_price=Decimal("65000"),
            margin=Money("30000", Asset("USDT")),
            beta_map={"BTC": Decimal("1")},
        ),
    )
    session.commit()

    loaded = repo.get_portfolio("pf_1")
    pos = loaded.positions["bybit_btc_perp"]
    assert pos.side == OrderSide.BUY
    assert pos.quantity == Decimal("1")
    assert pos.mark_price == Decimal("65000")
    assert pos.margin.amount == Decimal("30000")
    assert pos.beta_map == {"BTC": Decimal("1")}


def test_position_remove(session: Session) -> None:
    repo = PortfolioRepository(session)
    repo.save_portfolio(_portfolio())
    repo.upsert_position(
        "pf_1",
        Position(
            instrument_id="bybit_btc_perp",
            side=OrderSide.BUY,
            quantity=Decimal("1"),
            entry_price=Decimal("60000"),
            mark_price=Decimal("60000"),
        ),
    )
    repo.remove_position("pf_1", "bybit_btc_perp")
    session.commit()
    assert repo.get_portfolio("pf_1").positions == {}


def test_decimal_precision_in_positions(session: Session) -> None:
    repo = PortfolioRepository(session)
    repo.save_portfolio(_portfolio())
    repo.upsert_position(
        "pf_1",
        Position(
            instrument_id="x",
            side=OrderSide.BUY,
            quantity=Decimal("0.1"),
            entry_price=Decimal("0.2"),
            mark_price=Decimal("0.3"),
        ),
    )
    session.commit()
    loaded = repo.get_portfolio("pf_1").positions["x"]
    assert loaded.entry_price == Decimal("0.2")
    assert loaded.mark_price == Decimal("0.3")
