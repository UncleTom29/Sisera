from __future__ import annotations

import responses

from sisera.data.fred import FREDClient

BASE_URL = "https://fred.test/fred"


def _obs_response(pairs: list[tuple[str, str]]) -> dict:
    return {"observations": [{"date": d, "value": v} for d, v in pairs]}


def test_not_configured_without_api_key_returns_empty_without_http_call():
    client = FREDClient(api_key="", base_url=BASE_URL)
    assert client.is_configured is False
    assert client.get_recent_observations("FEDFUNDS") == []
    assert client.get_latest_observation("FEDFUNDS") is None


@responses.activate
def test_get_recent_observations_parses_valid_response():
    responses.add(
        responses.GET,
        f"{BASE_URL}/series/observations",
        json=_obs_response([("2026-07-01", "5.33"), ("2026-06-01", "5.08")]),
        status=200,
    )

    client = FREDClient(api_key="test-key", base_url=BASE_URL)
    obs = client.get_recent_observations("FEDFUNDS")

    assert obs == [("2026-07-01", 5.33), ("2026-06-01", 5.08)]


@responses.activate
def test_get_latest_observation_returns_most_recent_value():
    responses.add(
        responses.GET,
        f"{BASE_URL}/series/observations",
        json=_obs_response([("2026-07-01", "5.33"), ("2026-06-01", "5.08")]),
        status=200,
    )

    client = FREDClient(api_key="test-key", base_url=BASE_URL)
    assert client.get_latest_observation("FEDFUNDS") == 5.33


@responses.activate
def test_get_recent_observations_skips_missing_value_sentinel():
    responses.add(
        responses.GET,
        f"{BASE_URL}/series/observations",
        json=_obs_response([("2026-07-01", "."), ("2026-06-01", "5.08")]),
        status=200,
    )

    client = FREDClient(api_key="test-key", base_url=BASE_URL)
    obs = client.get_recent_observations("FEDFUNDS")

    assert obs == [("2026-06-01", 5.08)]


@responses.activate
def test_get_recent_observations_returns_empty_on_error_code_field():
    responses.add(
        responses.GET,
        f"{BASE_URL}/series/observations",
        json={"error_code": 400, "error_message": "Bad Request."},
        status=200,
    )

    client = FREDClient(api_key="test-key", base_url=BASE_URL)
    assert client.get_recent_observations("FEDFUNDS") == []


@responses.activate
def test_get_recent_observations_returns_empty_on_http_error_after_retries():
    # conftest.py sets SISERA_HTTP_MAX_RETRIES=1, so one failing response exhausts retries
    # without waiting out real exponential backoff.
    responses.add(
        responses.GET,
        f"{BASE_URL}/series/observations",
        json={"error": "internal error"},
        status=500,
    )

    client = FREDClient(api_key="test-key", base_url=BASE_URL)
    assert client.get_recent_observations("FEDFUNDS") == []
    assert client.get_latest_observation("FEDFUNDS") is None
