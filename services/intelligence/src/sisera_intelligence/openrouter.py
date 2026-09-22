"""OpenRouter LLM provider for the copilot (spec §20).

Implements `LLMProvider.complete()` against OpenRouter chat-completions. Requires
`SISERA_OPENROUTER_API_KEY` **and** `SISERA_COPILOT_LLM_ENABLED=true`; otherwise the
provider refuses (no silent fallback, no spend). Never used for execution decisions
(ADR-008) — synthesis only.
"""

from __future__ import annotations

import requests
from sisera_config import Settings


class OpenRouterNotConfigured(RuntimeError):
    pass


class OpenRouterProvider:
    def __init__(
        self,
        settings: Settings | None = None,
        timeout_seconds: float = 30.0,
        max_tokens: int = 600,
        temperature: float = 0.2,
    ) -> None:
        from sisera_config import get_settings

        self._settings = settings or get_settings()
        self._timeout = timeout_seconds
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._session = requests.Session()

    @property
    def is_configured(self) -> bool:
        s = self._settings
        return bool(s.openrouter_api_key.get_secret_value()) and bool(s.copilot_llm_enabled)

    @property
    def model(self) -> str:
        return self._settings.openrouter_model

    def complete(self, system: str, user: str) -> str:
        if not self.is_configured:
            raise OpenRouterNotConfigured(
                "OpenRouter is not enabled. Set SISERA_OPENROUTER_API_KEY and "
                "SISERA_COPILOT_LLM_ENABLED=true to enable paid synthesis."
            )
        resp = self._session.post(
            f"{self._settings.openrouter_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self._settings.openrouter_api_key.get_secret_value()}",
                "Content-Type": "application/json",
            },
            json={
                "model": self._settings.openrouter_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": self._temperature,
                "max_tokens": self._max_tokens,
            },
            timeout=self._timeout,
        )
        resp.raise_for_status()
        payload = resp.json()
        try:
            return str(payload["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenRouterNotConfigured(f"Unparseable OpenRouter response: {exc}") from exc
