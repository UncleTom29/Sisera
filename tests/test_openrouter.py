from __future__ import annotations

import json

import responses

from sisera.data.models import CoinMarketData, NewsItem
from sisera.data.openrouter import OpenRouterClient

BASE_URL = "https://openrouter.test/api/v1"


def _news_item(title: str = "Founder announces resignation") -> NewsItem:
    return NewsItem(
        source_type="rss", source_name="testfeed", item_id="item-1", title=title, url=None,
        published_ms=1_000_000_000_000,
    )


def _chat_response(content: dict) -> dict:
    return {"choices": [{"message": {"content": json.dumps(content)}}]}


def test_not_configured_without_api_key_returns_none_without_http_call():
    client = OpenRouterClient(api_key="", base_url=BASE_URL, model="test/model")
    assert client.is_configured is False
    assert client.analyze_fundamentals("BTCUSDT", "BTC") is None


@responses.activate
def test_analyze_fundamentals_parses_valid_response():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 0.4, "confidence": 0.7, "reasoning": "Strong dev activity."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.analyze_fundamentals(
        "BTCUSDT", "BTC", market_data=CoinMarketData(
            id="bitcoin", symbol="btc", name="Bitcoin", market_cap=1e12, market_cap_rank=1,
            current_price=64000.0,
        ),
    )

    assert result is not None
    assert result.symbol == "BTCUSDT"
    assert result.score == 0.4
    assert result.confidence == 0.7
    assert result.reasoning == "Strong dev activity."
    assert result.model == "test/model"


@responses.activate
def test_analyze_fundamentals_clips_out_of_range_score_and_confidence():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 5.0, "confidence": -2.0, "reasoning": "..."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.analyze_fundamentals("BTCUSDT", "BTC")

    assert result is not None
    assert result.score == 1.0
    assert result.confidence == 0.0


@responses.activate
def test_analyze_fundamentals_returns_none_on_malformed_json():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json={"choices": [{"message": {"content": "not valid json"}}]},
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.analyze_fundamentals("BTCUSDT", "BTC") is None


@responses.activate
def test_analyze_fundamentals_returns_none_on_missing_field():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"confidence": 0.5}),  # missing "score"
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.analyze_fundamentals("BTCUSDT", "BTC") is None


@responses.activate
def test_analyze_fundamentals_returns_none_on_http_error_after_retries():
    # conftest.py sets SISERA_HTTP_MAX_RETRIES=1, so a single failing response is
    # enough to exhaust retries without waiting out real exponential backoff.
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json={"error": "internal error"},
        status=500,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.analyze_fundamentals("BTCUSDT", "BTC") is None


@responses.activate
def test_analyze_fundamentals_returns_none_on_api_error_field():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json={"error": {"message": "invalid model"}},
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.analyze_fundamentals("BTCUSDT", "BTC") is None


def test_assess_news_headline_not_configured_returns_none_without_http_call():
    client = OpenRouterClient(api_key="", base_url=BASE_URL, model="test/model")
    assert client.assess_news_headline("BTCUSDT", "BTC", _news_item()) is None


@responses.activate
def test_assess_news_headline_parses_valid_response():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response(
            {
                "score": -0.7, "urgency": 0.8, "confidence": 0.4,
                "reasoning": "Unverified single-source claim.",
            }
        ),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None
    assert result.symbol == "BTCUSDT"
    assert result.news_item_id == "item-1"
    assert result.score == -0.7
    assert result.urgency == 0.8
    assert result.confidence == 0.4
    assert result.model == "test/model"


@responses.activate
def test_assess_news_headline_clips_out_of_range_values():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": -5.0, "urgency": 3.0, "confidence": -1.0, "reasoning": "..."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None
    assert result.score == -1.0
    assert result.urgency == 1.0
    assert result.confidence == 0.0


@responses.activate
def test_assess_news_headline_returns_none_on_missing_field():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 0.5, "confidence": 0.5}),  # missing "urgency"
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.assess_news_headline("BTCUSDT", "BTC", _news_item()) is None


@responses.activate
def test_assess_news_headline_returns_none_on_malformed_json():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json={"choices": [{"message": {"content": "not json"}}]},
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    assert client.assess_news_headline("BTCUSDT", "BTC", _news_item()) is None


@responses.activate
def test_assess_news_headline_parses_event_category_and_severity():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response(
            {
                "score": -0.6, "urgency": 0.7, "confidence": 0.5,
                "event_category": "security_hack", "severity": 4,
                "reasoning": "Reported protocol exploit.",
            }
        ),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None
    assert result.event_category == "security_hack"
    assert result.severity == 4


@responses.activate
def test_assess_news_headline_defaults_event_category_and_severity_when_missing():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 0.1, "urgency": 0.1, "confidence": 0.1, "reasoning": "..."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None
    assert result.event_category == "other"
    assert result.severity == 1


@responses.activate
def test_assess_news_headline_defaults_severity_when_malformed_rather_than_failing_call():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response(
            {
                "score": 0.1, "urgency": 0.1, "confidence": 0.1, "reasoning": "...",
                "severity": "very high",  # not an int -- should degrade, not fail the call
            }
        ),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None  # the malformed field must not invalidate the whole assessment
    assert result.severity == 1


@responses.activate
def test_assess_news_headline_clips_severity_to_valid_range():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response(
            {"score": 0.1, "urgency": 0.1, "confidence": 0.1, "reasoning": "...", "severity": 99}
        ),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    result = client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    assert result is not None
    assert result.severity == 5


@responses.activate
def test_assess_news_headline_includes_extra_context_in_request_body_when_provided():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 0.1, "urgency": 0.1, "confidence": 0.1, "reasoning": "..."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    client.assess_news_headline(
        "BTCUSDT", "BTC", _news_item(), extra_context="source track record: 40 calls, IC +0.30"
    )

    sent_body = json.loads(responses.calls[0].request.body)
    user_message = sent_body["messages"][1]["content"]
    assert "source track record: 40 calls, IC +0.30" in user_message


@responses.activate
def test_assess_news_headline_omits_context_section_when_not_provided():
    responses.add(
        responses.POST,
        f"{BASE_URL}/chat/completions",
        json=_chat_response({"score": 0.1, "urgency": 0.1, "confidence": 0.1, "reasoning": "..."}),
        status=200,
    )

    client = OpenRouterClient(api_key="test-key", base_url=BASE_URL, model="test/model")
    client.assess_news_headline("BTCUSDT", "BTC", _news_item())

    sent_body = json.loads(responses.calls[0].request.body)
    user_message = sent_body["messages"][1]["content"]
    assert "Context:" not in user_message
