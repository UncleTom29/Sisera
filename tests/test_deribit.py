from __future__ import annotations

import pytest
import responses
from responses import matchers

from sisera.data.deribit import DeribitAPIError, DeribitClient

BASE_URL = "https://www.deribit.com/api/v2"


def _result(result) -> dict:
    return {"jsonrpc": "2.0", "id": 1, "result": result}


@responses.activate
def test_get_dvol_reads_index_price():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_index_price",
        json=_result({"index_price": 34.78, "estimated_delivery_price": 34.78}),
        status=200,
        match=[matchers.query_param_matcher({"index_name": "btcdvol_usdc"})],
    )

    client = DeribitClient(base_url=BASE_URL)
    dvol = client.get_dvol("BTC")

    assert dvol == 34.78


@responses.activate
def test_get_dvol_lowercases_currency_for_index_name():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_index_price",
        json=_result({"index_price": 48.55}),
        status=200,
        match=[matchers.query_param_matcher({"index_name": "ethdvol_usdc"})],
    )

    client = DeribitClient(base_url=BASE_URL)
    assert client.get_dvol("ETH") == 48.55


@responses.activate
def test_error_response_raises():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_index_price",
        json={"jsonrpc": "2.0", "id": 1, "error": {"code": -32602, "message": "Invalid params"}},
        status=200,
    )

    client = DeribitClient(base_url=BASE_URL)
    with pytest.raises(DeribitAPIError, match="Invalid params"):
        client.get_dvol("BTC")


@responses.activate
def test_get_option_instruments_parses_fields():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_instruments",
        json=_result(
            [
                {
                    "instrument_name": "BTC-14AUG26-50000-C",
                    "option_type": "call",
                    "strike": 50000.0,
                    "expiration_timestamp": 1786665600000,
                },
                {
                    "instrument_name": "BTC-14AUG26-45000-P",
                    "option_type": "put",
                    "strike": 45000.0,
                    "expiration_timestamp": 1786665600000,
                },
            ]
        ),
        status=200,
    )

    client = DeribitClient(base_url=BASE_URL)
    instruments = client.get_option_instruments("BTC")

    assert len(instruments) == 2
    assert instruments[0].option_type == "call"
    assert instruments[1].strike == 45000.0


@responses.activate
def test_get_option_ticker_parses_mark_iv_and_delta():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/ticker",
        json=_result(
            {
                "instrument_name": "BTC-14AUG26-50000-C",
                "mark_iv": 71.24,
                "greeks": {"delta": 0.45},
                "underlying_price": 63378.01,
            }
        ),
        status=200,
    )

    client = DeribitClient(base_url=BASE_URL)
    ticker = client.get_option_ticker("BTC-14AUG26-50000-C")

    assert ticker is not None
    assert ticker.mark_iv == 71.24
    assert ticker.delta == 0.45


@responses.activate
def test_get_option_ticker_returns_none_when_illiquid():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/ticker",
        json=_result(
            {
                "instrument_name": "BTC-14AUG26-1000000-C",
                "mark_iv": None,
                "greeks": {"delta": None},
                "underlying_price": 63378.01,
            }
        ),
        status=200,
    )

    client = DeribitClient(base_url=BASE_URL)
    ticker = client.get_option_ticker("BTC-14AUG26-1000000-C")

    assert ticker is None


@responses.activate
def test_get_near_money_option_tickers_filters_by_moneyness_and_expiry():
    underlying_price = 60000.0
    near_expiry_ms = 2_000_000_000_000
    far_expiry_ms = 3_000_000_000_000

    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_instruments",
        json=_result(
            [
                # within moneyness band, nearest expiry -> should be queried
                {
                    "instrument_name": "BTC-X-58000-C",
                    "option_type": "call",
                    "strike": 58000.0,
                    "expiration_timestamp": near_expiry_ms,
                },
                # outside moneyness band (way OTM) -> should be filtered out
                {
                    "instrument_name": "BTC-X-200000-C",
                    "option_type": "call",
                    "strike": 200000.0,
                    "expiration_timestamp": near_expiry_ms,
                },
                # correct moneyness but a later expiry -> should be filtered out
                {
                    "instrument_name": "BTC-Y-59000-C",
                    "option_type": "call",
                    "strike": 59000.0,
                    "expiration_timestamp": far_expiry_ms,
                },
            ]
        ),
        status=200,
    )
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/ticker",
        json=_result(
            {
                "instrument_name": "BTC-X-58000-C",
                "mark_iv": 65.0,
                "greeks": {"delta": 0.3},
                "underlying_price": underlying_price,
            }
        ),
        status=200,
        match=[matchers.query_param_matcher({"instrument_name": "BTC-X-58000-C"})],
    )

    client = DeribitClient(base_url=BASE_URL)
    tickers = client.get_near_money_option_tickers(
        "BTC", underlying_price=underlying_price, moneyness_band=0.1, min_days_to_expiry=0
    )

    assert len(tickers) == 1
    assert tickers[0].instrument_name == "BTC-X-58000-C"


@responses.activate
def test_get_near_money_option_tickers_returns_empty_when_no_eligible_expiry():
    responses.add(
        responses.GET,
        f"{BASE_URL}/public/get_instruments",
        json=_result([]),
        status=200,
    )

    client = DeribitClient(base_url=BASE_URL)
    tickers = client.get_near_money_option_tickers("BTC", underlying_price=60000.0)

    assert tickers == []
