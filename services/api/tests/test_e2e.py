"""Full-stack E2E: authenticated order lifecycle + ledger + realtime over HTTP/WS/DB.

Exercises POST/GET /orders, POST /advance, POST /ledger/entries, GET /balances, and
the WebSocket broadcast in one coherent workflow against file-backed SQLite. This is the
§59 golden path through the running API surface (risk/SOR/paper-fill wiring as dedicated
execution endpoints is tracked separately).
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi.testclient import TestClient
from sisera_api import RealtimeHub, create_app
from sisera_domain import Asset, CanonicalAsset, Instrument, InstrumentType, Money, Portfolio
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
from test_api import MockVerifier

AUTH = {"Authorization": "Bearer test-token"}


def _stack(tmp_path: Path) -> tuple[TestClient, RealtimeHub]:
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

    # Seed instrument + portfolio directly via repositories.
    inst_repo = InstrumentRepository(inst_session)
    inst_repo.upsert_asset(CanonicalAsset(asset_id="asset_btc", symbol="BTC", name="Bitcoin"))
    inst_repo.upsert_instrument(
        Instrument(
            instrument_id="bybit_btc_perp",
            canonical_asset_id="asset_btc",
            symbol="BTCUSDT",
            display_symbol="BTC-PERP",
            instrument_type=InstrumentType.PERPETUAL,
            base_asset=Asset("BTC"),
            quote_asset=Asset("USDT"),
            settlement_asset=Asset("USDT"),
            venue="bybit",
        )
    )
    pf_repo = PortfolioRepository(pf_session)
    pf_repo.save_portfolio(
        Portfolio(
            portfolio_id="pf_1",
            name="Main",
            quote_asset=Asset("USDT"),
            cash={"USDT": Money("100000", Asset("USDT"))},
            peak_equity=__import__("decimal").Decimal("100000"),
        )
    )
    inst_session.commit()
    pf_session.commit()

    hub = RealtimeHub()
    app = create_app(
        order_repo_factory=lambda: OrderRepository(oms_session),
        ledger_repo_factory=lambda: LedgerRepository(ledger_session),
        instrument_repo_factory=lambda: InstrumentRepository(inst_session),
        portfolio_repo_factory=lambda: PortfolioRepository(pf_session),
        verifier=MockVerifier(),
        hub=hub,
    )
    return TestClient(app), hub


def test_e2e_order_to_ledger_to_broadcast(tmp_path: Path) -> None:
    client, hub = _stack(tmp_path)

    # 1. Instrument + portfolio are queryable.
    assert client.get("/api/v1/instruments/bybit_btc_perp").status_code == 200
    assert client.get("/api/v1/portfolios/pf_1").json()["portfolio_id"] == "pf_1"

    # 2. Authenticated order creation (idempotent).
    order_body = {
        "client_order_id": "e2e_1",
        "instrument_id": "bybit_btc_perp",
        "side": "BUY",
        "order_type": "LIMIT",
        "quantity": "0.5",
        "price": "64000",
        "account_id": "a",
        "portfolio_id": "pf_1",
    }
    created = client.post("/api/v1/orders", json=order_body, headers=AUTH)
    assert created.status_code == 201
    oid = created.json()["sisera_order_id"]
    assert created.json()["user_id"] == "test_user"

    # 3. Advance through the lifecycle.
    for target in ["VALIDATING", "RISK_CHECK", "ROUTING", "SUBMITTING", "ACKNOWLEDGED"]:
        r = client.post(f"/api/v1/orders/{oid}/advance", json={"target": target}, headers=AUTH)
        assert r.status_code == 200, r.text
    assert client.get(f"/api/v1/orders/{oid}").json()["state"] == "ACKNOWLEDGED"

    # 4. Post the fill to the financial ledger.
    fill = {
        "entry_id": "e2e_fill_1",
        "entry_type": "FILL",
        "postings": [
            {"account": "cash", "asset": "USDT", "amount": "-32036"},
            {"account": "counterparty", "asset": "USDT", "amount": "32000"},
            {"account": "fee_account", "asset": "USDT", "amount": "36"},
            {"account": "inventory", "asset": "BTC", "amount": "0.5"},
            {"account": "counterparty", "asset": "BTC", "amount": "-0.5"},
        ],
    }
    assert client.post("/api/v1/ledger/entries", json=fill, headers=AUTH).status_code == 201
    balances = client.get("/api/v1/ledger/balances", params={"account": "cash"}).json()
    assert balances == {"USDT": "-32036"}

    # 5. Realtime broadcast reaches an authenticated subscriber.
    with client.websocket_connect("/ws/v1/stream?token=test-token") as ws:
        ws.receive_json()  # hello
        asyncio.run(hub.broadcast("orders.*", {"sisera_order_id": oid, "state": "ACKNOWLEDGED"}))
        event = ws.receive_json()
        assert event["type"] == "event"
        assert event["channel"] == "orders.*"
        assert event["sequence"] == 1
        assert event["data"]["sisera_order_id"] == oid
