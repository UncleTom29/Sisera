"""Tests for the Decision Ledger repository."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import Decision, DecisionKind, SignalComponent
from sisera_ledger import Base, DecisionRepository, create_db_engine, session_factory
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


def _decision(decision_id: str = "d1", symbol: str = "BTC") -> Decision:
    return Decision(
        decision_id=decision_id,
        timestamp_ms=0,
        instrument_id="bybit_btc_perp",
        symbol=symbol,
        direction="BUY",
        kind=DecisionKind.TRADE,
        strategy_version="v1",
        model_version="v1",
        confidence=Decimal("0.65"),
        expected_value=Decimal("0.4"),
        uncertainty=Decimal("0.1"),
        features={"funding_percentile": Decimal("0.8")},
        signal_components=(SignalComponent(name="momentum", value=Decimal("0.7"), weight=Decimal("1")),),
        reason_codes=("TRADE",),
        risk_result={"approved": True},
    )


def test_record_and_get_round_trip(session: Session) -> None:
    repo = DecisionRepository(session)
    repo.record(_decision())
    session.commit()

    loaded = repo.get("d1")
    assert loaded is not None
    assert loaded.kind == DecisionKind.TRADE
    assert loaded.confidence == Decimal("0.65")
    assert loaded.features["funding_percentile"] == Decimal("0.8")
    assert loaded.signal_components[0].name == "momentum"
    assert loaded.risk_result["approved"] is True


def test_record_is_idempotent(session: Session) -> None:
    repo = DecisionRepository(session)
    repo.record(_decision())
    repo.record(_decision())
    session.commit()
    assert repo.query(symbol="BTC")[0].decision_id == "d1"


def test_query_filters(session: Session) -> None:
    repo = DecisionRepository(session)
    repo.record(_decision("d1", symbol="BTC"))
    repo.record(_decision("d2", symbol="ETH"))
    session.commit()
    assert len(repo.query(symbol="BTC")) == 1
    assert len(repo.query(kind=DecisionKind.TRADE)) == 2


def test_counterfactuals_only_settled(session: Session) -> None:
    repo = DecisionRepository(session)
    repo.record(_decision("d1"))
    repo.record(_decision("d2").model_copy(update={"counterfactual": "MISSED_OPPORTUNITY"}))
    session.commit()
    assert len(repo.counterfactuals()) == 1
    assert repo.counterfactuals()[0].decision_id == "d2"
