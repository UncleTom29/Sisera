from __future__ import annotations

import responses

from sisera.data.treasury_fiscal import TreasuryFiscalClient

BASE_URL = "https://treasury.test/services/api/fiscal_service"


@responses.activate
def test_get_avg_interest_rate_parses_matching_security_desc():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v2/accounting/od/avg_interest_rates",
        json={
            "data": [
                {"record_date": "2026-07-31", "security_desc": "Treasury Bills", "avg_interest_rate_amt": "3.758"},
                {"record_date": "2026-07-31", "security_desc": "Treasury Notes", "avg_interest_rate_amt": "3.309"},
            ]
        },
        status=200,
    )

    client = TreasuryFiscalClient(base_url=BASE_URL)
    rate = client.get_avg_interest_rate("Treasury Notes")

    assert rate == 3.309


@responses.activate
def test_get_avg_interest_rate_returns_none_when_security_desc_not_present():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v2/accounting/od/avg_interest_rates",
        json={"data": [{"record_date": "2026-07-31", "security_desc": "Treasury Bills", "avg_interest_rate_amt": "3.758"}]},
        status=200,
    )

    client = TreasuryFiscalClient(base_url=BASE_URL)
    assert client.get_avg_interest_rate("Treasury Bonds") is None


@responses.activate
def test_get_avg_interest_rate_returns_none_on_http_error_after_retries():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v2/accounting/od/avg_interest_rates",
        json={"error": "internal error"},
        status=500,
    )

    client = TreasuryFiscalClient(base_url=BASE_URL)
    assert client.get_avg_interest_rate("Treasury Notes") is None
