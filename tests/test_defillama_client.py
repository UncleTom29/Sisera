from __future__ import annotations

import time

import responses

from sisera.data.defillama import DeFiLlamaClient

BASE_URL = "https://defillama.test"


@responses.activate
def test_get_aggregate_tvl_sums_protocols():
    responses.add(
        responses.GET,
        f"{BASE_URL}/protocols",
        json=[{"name": "A", "tvl": 100.0}, {"name": "B", "tvl": 250.5}, {"name": "C", "tvl": None}],
        status=200,
    )

    client = DeFiLlamaClient(base_url=BASE_URL)
    assert client.get_aggregate_tvl() == 350.5


@responses.activate
def test_get_aggregate_tvl_returns_none_on_http_error_after_retries():
    responses.add(responses.GET, f"{BASE_URL}/protocols", json={"error": "down"}, status=500)

    client = DeFiLlamaClient(base_url=BASE_URL)
    assert client.get_aggregate_tvl() is None


@responses.activate
def test_get_historical_tvl_returns_closest_matching_day():
    now = time.time()
    series = [
        {"date": now - 30 * 86400, "tvl": 1000.0},
        {"date": now - 7 * 86400, "tvl": 2000.0},  # the one we want, ~7 days back
        {"date": now - 1 * 86400, "tvl": 3000.0},
    ]
    responses.add(responses.GET, f"{BASE_URL}/v2/historicalChainTvl", json=series, status=200)

    client = DeFiLlamaClient(base_url=BASE_URL)
    assert client.get_historical_tvl(days_ago=7) == 2000.0


@responses.activate
def test_get_historical_tvl_returns_none_on_empty_series():
    responses.add(responses.GET, f"{BASE_URL}/v2/historicalChainTvl", json=[], status=200)

    client = DeFiLlamaClient(base_url=BASE_URL)
    assert client.get_historical_tvl(days_ago=7) is None
