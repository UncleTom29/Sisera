"""Tests for the versioned API service (spec §45). Uses file-backed SQLite repositories
(file DBs are shared across the TestClient worker thread; :memory: is per-connection)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sisera_api import create_app
from sisera_instruments import Base as InstrumentsBase
from sisera_instruments import InstrumentRepository
from sisera_instruments import create_db_engine as instruments_engine
from sisera_instruments import session_factory as instruments_sessions
from sisera_ledger import Base as LedgerBase
from sisera_ledger import LedgerRepository
from sisera_ledger import create_db_engine as ledger_engine
from sisera_ledger import session_factory as ledger_sessions
from sisera_oms import Base as OmsBase
from sisera_oms import OrderRepository
from sisera_oms import create_db_engine as oms_engine
from sisera_oms import session_factory as oms_sessions
from sisera_portfolio import Base as PortfolioBase
from sisera_portfolio import PortfolioRepository
from sisera_portfolio import create_db_engine as portfolio_engine
from sisera_portfolio import session_factory as portfolio_sessions
from sqlalchemy.orm import Session


def _client(tmp_path: Path) -> TestClient:
    oms_eng = oms_engine(f"sqlite+pysqlite:///{tmp_path}/oms.db")
    OmsBase.metadata.create_all(oms_eng)
    oms_session: Session = oms_sessions(oms_eng)()

    ledger_eng = ledger_engine(f"sqlite+pysqlite:///{tmp_path}/ledger.db")
    LedgerBase.metadata.create_all(ledger_eng)
    ledger_session: Session = ledger_sessions(ledger_eng)()

    inst_eng = instruments_engine(f"sqlite+pysqlite:///{tmp_path}/inst.db")
    InstrumentsBase.metadata.create_all(inst_eng)
    inst_session: Session = instruments_sessions(inst_eng)()

    pf_eng = portfolio_engine(f"sqlite+pysqlite:///{tmp_path}/pf.db")
    PortfolioBase.metadata.create_all(pf_eng)
    pf_session: Session = portfolio_sessions(pf_eng)()

    app = create_app(
        order_repo_factory=lambda: OrderRepository(oms_session),
        ledger_repo_factory=lambda: LedgerRepository(ledger_session),
        instrument_repo_factory=lambda: InstrumentRepository(inst_session),
        portfolio_repo_factory=lambda: PortfolioRepository(pf_session),
    )
    return TestClient(app)


def test_health(tmp_path: Path) -> None:
    assert _client(tmp_path).get("/api/v1/health").json() == {"status": "ok"}


def test_create_and_get_order(tmp_path: Path) -> None:
    client = _client(tmp_path)
    body = {
        "client_order_id": "c1",
        "instrument_id": "bybit_btc_perp",
        "side": "BUY",
        "order_type": "LIMIT",
        "quantity": "0.5",
        "price": "64000",
        "account_id": "a",
        "portfolio_id": "p",
    }
    created = client.post("/api/v1/orders", json=body)
    assert created.status_code == 201
    assert created.json()["client_order_id"] == "c1"

    # Idempotent retry returns the same order.
    retry = client.post("/api/v1/orders", json=body)
    assert retry.json()["sisera_order_id"] == created.json()["sisera_order_id"]

    fetched = client.get(f"/api/v1/orders/{created.json()['sisera_order_id']}")
    assert fetched.json()["quantity"] == "0.5"


def test_advance_order_and_illegal_transition(tmp_path: Path) -> None:
    client = _client(tmp_path)
    body = {
        "client_order_id": "c2",
        "instrument_id": "x",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": "1",
        "account_id": "a",
        "portfolio_id": "p",
    }
    created = client.post("/api/v1/orders", json=body).json()
    oid = created["sisera_order_id"]

    ok = client.post(f"/api/v1/orders/{oid}/advance", json={"target": "VALIDATING"})
    assert ok.json()["state"] == "VALIDATING"

    bad = client.post(f"/api/v1/orders/{oid}/advance", json={"target": "FILLED"})
    assert bad.status_code == 422


def test_ledger_post_and_balances(tmp_path: Path) -> None:
    client = _client(tmp_path)
    body = {
        "entry_id": "e1",
        "entry_type": "DEPOSIT",
        "postings": [
            {"account": "cash", "asset": "USDT", "amount": "1000"},
            {"account": "external", "asset": "USDT", "amount": "-1000"},
        ],
    }
    created = client.post("/api/v1/ledger/entries", json=body)
    assert created.status_code == 201

    balances = client.get("/api/v1/ledger/balances", params={"account": "cash"}).json()
    assert balances == {"USDT": "1000"}


def test_missing_instrument_returns_404(tmp_path: Path) -> None:
    assert _client(tmp_path).get("/api/v1/instruments/nope").status_code == 404


def test_missing_portfolio_returns_404(tmp_path: Path) -> None:
    assert _client(tmp_path).get("/api/v1/portfolios/nope").status_code == 404
