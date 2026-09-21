from __future__ import annotations

import responses

from sisera.data.x_client import XClient
from sisera.data.x_spend_tracker import XSpendTracker

BASE_URL = "https://x.test"


def _tracker(tmp_path, max_daily_spend_usd: float = 10.0) -> XSpendTracker:
    return XSpendTracker(db_path=str(tmp_path / "x_spend.db"), max_daily_spend_usd=max_daily_spend_usd)


def test_not_configured_without_bearer_token_returns_empty_without_http_call(tmp_path):
    client = XClient(bearer_token="", base_url=BASE_URL, spend_tracker=_tracker(tmp_path))
    assert client.is_configured is False
    assert client.fetch_recent_posts(("DeItaone",)) == []


def test_fetch_recent_posts_with_no_usernames_returns_empty_without_http_call(tmp_path):
    client = XClient(bearer_token="test-token", base_url=BASE_URL, spend_tracker=_tracker(tmp_path))
    assert client.fetch_recent_posts(()) == []


@responses.activate
def test_fetch_recent_posts_parses_valid_response_and_maps_author_to_username(tmp_path):
    responses.add(
        responses.GET,
        f"{BASE_URL}/2/tweets/search/recent",
        json={
            "data": [
                {"id": "111", "text": "Fed may hike rates", "created_at": "2026-08-18T12:00:00.000Z", "author_id": "u1"},
            ],
            "includes": {"users": [{"id": "u1", "username": "DeItaone"}]},
        },
        status=200,
    )

    client = XClient(bearer_token="test-token", base_url=BASE_URL, spend_tracker=_tracker(tmp_path))
    items = client.fetch_recent_posts(("DeItaone",))

    assert len(items) == 1
    assert items[0].source_type == "x"
    assert items[0].source_name == "DeItaone"
    assert items[0].item_id == "x:111"
    assert items[0].title == "Fed may hike rates"
    assert items[0].url == "https://x.com/DeItaone/status/111"


@responses.activate
def test_fetch_recent_posts_records_spend_for_actual_posts_returned(tmp_path):
    responses.add(
        responses.GET,
        f"{BASE_URL}/2/tweets/search/recent",
        json={
            "data": [
                {"id": "1", "text": "a", "created_at": "2026-08-18T12:00:00.000Z", "author_id": "u1"},
                {"id": "2", "text": "b", "created_at": "2026-08-18T12:01:00.000Z", "author_id": "u1"},
            ],
            "includes": {"users": [{"id": "u1", "username": "DeItaone"}]},
        },
        status=200,
    )

    tracker = _tracker(tmp_path)
    client = XClient(bearer_token="test-token", base_url=BASE_URL, spend_tracker=tracker)
    client.fetch_recent_posts(("DeItaone",))

    # 2 posts returned * $0.005/read (config default) -- see conftest/config defaults.
    assert tracker.today_spend_usd() > 0.0


@responses.activate
def test_fetch_recent_posts_refuses_without_http_call_when_cap_would_be_exceeded(tmp_path):
    tracker = _tracker(tmp_path, max_daily_spend_usd=0.0)  # already at cap
    client = XClient(bearer_token="test-token", base_url=BASE_URL, spend_tracker=tracker)

    items = client.fetch_recent_posts(("DeItaone",))

    assert items == []
    assert len(responses.calls) == 0  # never made the HTTP request


@responses.activate
def test_fetch_recent_posts_returns_empty_on_http_error_after_retries(tmp_path):
    responses.add(
        responses.GET, f"{BASE_URL}/2/tweets/search/recent", json={"error": "down"}, status=500
    )

    client = XClient(bearer_token="test-token", base_url=BASE_URL, spend_tracker=_tracker(tmp_path))
    assert client.fetch_recent_posts(("DeItaone",)) == []
