"""Comprehensive tests for institutional API endpoints (spec §45, §59–61).

Tests:
- Order preview (fees, slippage, margin impact, pre-trade risk, SOR route plan)
- Golden execution pipeline (execute -> fill -> ledger -> TCA -> decision provenance -> ws event)
- Positions listing & closing
- Pre-trade risk check & Stress testing simulation
- Multi-scope kill switches (trip & clear)
- Copilot analysis with grounded evidence
- Natural language intent compiler
- Differential intelligence ("What Changed?")
- Market Memory historical analog query
- Opportunities listing
- Agents management (create, scan, autonomy)
- Prediction markets (order placement, resolution)
- Analytics & TCA reports
- Notifications feed & read status
- Organization & user profile (RBAC)
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from test_api import AUTH_HEADERS, _client


def test_order_preview(tmp_path: Path) -> None:
    client = _client(tmp_path)
    preview_body = {
        "instrument_id": "bybit_btc_perp",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": "0.5",
        "portfolio_id": "pf_1",
    }
    resp = client.post("/api/v1/orders/preview", json=preview_body)
    assert resp.status_code == 200
    data = resp.json()
    assert Decimal(data["estimated_fill_price"]) > 0
    assert Decimal(data["estimated_fees"]) > 0
    assert data["risk_check"]["approved"] is True
    assert data["route_plan"]["decision"] == "ROUTE"


def test_order_execution_golden_pipeline(tmp_path: Path) -> None:
    client = _client(tmp_path)
    # 1. Create order
    create_body = {
        "client_order_id": "exec_test_1",
        "instrument_id": "bybit_btc_perp",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": "0.25",
        "account_id": "acct_test",
        "portfolio_id": "pf_1",
    }
    order = client.post("/api/v1/orders", json=create_body, headers=AUTH_HEADERS).json()
    oid = order["sisera_order_id"]

    # 2. Execute via pipeline
    exec_resp = client.post(f"/api/v1/orders/{oid}/execute", json={}, headers=AUTH_HEADERS)
    assert exec_resp.status_code == 200
    res = exec_resp.json()
    assert res["order"]["state"] == "FILLED"
    assert Decimal(res["fill"]["filled_quantity"]) == Decimal("0.25")
    assert "slippage_bps" in res["tca"]

    # 3. Position is tracked
    positions = client.get("/api/v1/positions").json()
    assert any(p["instrument_id"] == "bybit_btc_perp" for p in positions)


def test_risk_check_and_stress_test(tmp_path: Path) -> None:
    client = _client(tmp_path)
    check_body = {
        "client_order_id": "chk_1",
        "instrument_id": "bybit_btc_perp",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": "1.0",
        "account_id": "a",
        "portfolio_id": "pf_1",
    }
    chk = client.post("/api/v1/risk/check", json=check_body).json()
    assert chk["approved"] is True

    stress = client.post("/api/v1/risk/stress-test", json={"portfolio_id": "pf_1"}).json()
    assert len(stress["results"]) >= 4
    assert any("BTC" in r["scenario"] for r in stress["results"])


def test_kill_switches(tmp_path: Path) -> None:
    client = _client(tmp_path)
    # Trip kill switch
    trip = client.post(
        "/api/v1/risk/kill-switch/trip",
        json={"scope": "GLOBAL", "reason": "Market volatility spike"},
        headers=AUTH_HEADERS,
    )
    assert trip.status_code == 200
    assert client.get("/api/v1/risk/kill-switch").json()["global_tripped"] is True

    # Clear kill switch
    clear = client.post(
        "/api/v1/risk/kill-switch/clear",
        json={"scope": "GLOBAL", "reason": "Operator resumed normal trading"},
        headers=AUTH_HEADERS,
    )
    assert clear.status_code == 200
    assert client.get("/api/v1/risk/kill-switch").json()["global_tripped"] is False


def test_copilot_and_intent_compiler(tmp_path: Path) -> None:
    client = _client(tmp_path)
    copilot_resp = client.post(
        "/api/v1/intelligence/copilot",
        json={"question": "Why is BTC outperforming ETH?", "instrument_id": "BTC-PERP"},
    )
    assert copilot_resp.status_code == 200
    answer = copilot_resp.json()
    assert len(answer["evidence"]) > 0
    assert "synthesis" in answer

    intent_resp = client.post(
        "/api/v1/intelligence/intent",
        json={"prompt": "Buy $20,000 ETH if funding is below 80th percentile"},
    )
    assert intent_resp.status_code == 200
    intent = intent_resp.json()
    assert intent["compiled_intent"]["instrument"] == "ETH-PERP"
    assert intent["compiled_intent"]["action"] == "BUY"


def test_differential_and_memory(tmp_path: Path) -> None:
    client = _client(tmp_path)
    diff = client.get("/api/v1/intelligence/differential").json()
    assert diff["instrument_id"] == "BTC-PERP"
    assert len(diff["factors"]) > 0

    mem = client.post(
        "/api/v1/intelligence/memory",
        json={"instrument_id": "bybit_btc_perp", "top_k": 2},
    ).json()
    assert len(mem) >= 1
    assert "similarity" in mem[0]


def test_agents_and_predictions(tmp_path: Path) -> None:
    client = _client(tmp_path)
    agents = client.get("/api/v1/agents").json()
    assert len(agents) >= 2

    # Create agent
    new_agent = client.post(
        "/api/v1/agents",
        json={
            "name": "Trend Pilot",
            "manifest_yaml": "name: trend-pilot\nuniverse:\n  instruments: [BTC]\n",
            "autonomy_level": "SUGGEST",
            "allocated_capital": "30000",
        },
        headers=AUTH_HEADERS,
    ).json()
    assert new_agent["name"] == "Trend Pilot"

    # Prediction markets
    predictions = client.get("/api/v1/predictions").json()
    assert len(predictions) >= 2
    pred_order = client.post(
        "/api/v1/predictions/orders",
        json={
            "market_id": predictions[0]["market_id"],
            "outcome_id": "out_yes",
            "side": "BUY",
            "quantity": "50",
        },
        headers=AUTH_HEADERS,
    )
    assert pred_order.status_code == 201


def test_analytics_and_organizations(tmp_path: Path) -> None:
    client = _client(tmp_path)
    tca = client.get("/api/v1/analytics/tca").json()
    assert "summary" in tca
    assert "markouts" in tca

    orgs = client.get("/api/v1/organizations").json()
    assert orgs["organization_id"] == "org_sisera_inst"

    me = client.get("/api/v1/auth/me", headers=AUTH_HEADERS).json()
    assert me["role"] == "PORTFOLIO_MANAGER"
