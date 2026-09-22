"""Tests for the OpenRouter provider (mocked HTTP, no spend, no network)."""

from __future__ import annotations

import pytest
import responses as responses_lib
from sisera_config import Settings
from sisera_intelligence import Copilot, OpenRouterNotConfigured, OpenRouterProvider


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


def test_refuses_when_unconfigured() -> None:
    provider = OpenRouterProvider(_settings())
    assert provider.is_configured is False
    with pytest.raises(OpenRouterNotConfigured):
        provider.complete("system", "user")


def test_refuses_when_key_but_not_enabled() -> None:
    provider = OpenRouterProvider(_settings(openrouter_api_key="sk-test"))
    assert provider.is_configured is False
    with pytest.raises(OpenRouterNotConfigured):
        provider.complete("system", "user")


@responses_lib.activate
def test_complete_posts_and_returns_text() -> None:
    settings = _settings(openrouter_api_key="sk-test", copilot_llm_enabled=True)
    responses_lib.add(
        responses_lib.POST,
        "https://openrouter.ai/api/v1/chat/completions",
        json={"choices": [{"message": {"content": "Grounded synthesis."}}]},
        status=200,
    )
    provider = OpenRouterProvider(settings)
    assert provider.is_configured is True
    assert provider.complete("system", "user") == "Grounded synthesis."
    # Authorization header present, key never in URL or logs.
    sent = responses_lib.calls[0].request
    assert sent.headers["Authorization"] == "Bearer sk-test"
    assert "sk-test" not in sent.url


@responses_lib.activate
def test_copilot_uses_openrouter_when_configured() -> None:
    settings = _settings(openrouter_api_key="sk-test", copilot_llm_enabled=True)
    responses_lib.add(
        responses_lib.POST,
        "https://openrouter.ai/api/v1/chat/completions",
        json={"choices": [{"message": {"content": "Live synthesis."}}]},
        status=200,
    )
    copilot = Copilot(llm=OpenRouterProvider(settings), model_name=settings.openrouter_model)
    answer = copilot.analyze("Why?")
    assert answer.synthesis == "Live synthesis."
    assert answer.model == settings.openrouter_model
