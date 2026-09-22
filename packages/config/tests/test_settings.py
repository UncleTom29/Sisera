"""Tests for the typed config layer and the live-trading safety gate."""

from __future__ import annotations

import pytest
from sisera_config import (
    Environment,
    LiveTradingDisabled,
    LiveTradingGuard,
    Settings,
)


def _settings(**overrides: object) -> Settings:
    # Use empty env_file so a developer's local .env can't leak into tests.
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


def test_defaults_are_safe() -> None:
    s = _settings()
    assert s.live_trading_enabled is False
    assert s.use_testnet is True
    assert s.environment == Environment.DEV


def test_bool_env_parsing() -> None:
    assert _settings(live_trading_enabled="true").live_trading_enabled is True
    assert _settings(live_trading_enabled="1").live_trading_enabled is True
    assert _settings(live_trading_enabled="false").live_trading_enabled is False
    assert _settings(live_trading_enabled="off").live_trading_enabled is False


def test_environment_normalized_to_lower() -> None:
    assert _settings(environment="PROD").environment == Environment.PROD


def test_live_trading_guard_blocks_by_default() -> None:
    guard = LiveTradingGuard(_settings())
    assert guard.live_enabled is False
    with pytest.raises(LiveTradingDisabled):
        guard.assert_live_allowed()


def test_live_trading_guard_blocks_non_prod_even_if_enabled() -> None:
    # Enabled flag but non-prod environment -> still blocked.
    guard = LiveTradingGuard(_settings(live_trading_enabled=True, environment="dev"))
    with pytest.raises(LiveTradingDisabled):
        guard.assert_live_allowed()


def test_live_trading_guard_allows_explicit_prod() -> None:
    guard = LiveTradingGuard(_settings(live_trading_enabled=True, environment="prod"))
    assert guard.live_enabled is True
    guard.assert_live_allowed()  # must not raise


def test_secrets_are_masked_in_redacted() -> None:
    s = _settings(bybit_api_key="secret-key-123", bybit_api_secret="secret-abc")
    redacted = s.redacted()
    assert "secret-key-123" not in str(redacted)
    assert redacted["bybit_api_key_set"] is True
    assert "secret-key-123" not in repr(s.bybit_api_key)


def test_guard_is_paper_when_disabled() -> None:
    assert LiveTradingGuard(_settings()).is_paper_or_testnet() is True
    assert (
        LiveTradingGuard(_settings(live_trading_enabled=True, environment="prod")).is_paper_or_testnet()
        is False
    )


def test_openrouter_defaults_off() -> None:
    # Explicit empty values: the full suite may have loaded a real .env into
    # os.environ via legacy sisera.config.load_dotenv(), and pydantic-settings reads
    # environ even with _env_file=None. Explicit kwargs take precedence.
    s = _settings(openrouter_api_key="", copilot_llm_enabled=False)
    assert s.openrouter_api_key.get_secret_value() == ""
    assert s.copilot_llm_enabled is False
    assert s.redacted()["openrouter_api_key_set"] is False


def test_openrouter_key_masked() -> None:
    s = _settings(openrouter_api_key="sk-secret", copilot_llm_enabled="true")
    assert s.copilot_llm_enabled is True
    assert "sk-secret" not in str(s.redacted())
    assert s.redacted()["openrouter_api_key_set"] is True
