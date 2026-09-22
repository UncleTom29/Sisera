"""Polymarket public clients (no auth).

Gamma API (`https://gamma-api.polymarket.com`) for market/event discovery — public, no
key. CLOB public endpoints (`https://clob.polymarket.com/book`, `/price`, `/midpoint`)
for order-book and price reads — public, no auth. Authenticated CLOB writes (L1 EIP-712 +
L2 HMAC order placement) are intentionally out of scope; see `docs/connectors/polymarket.md`.
"""

from __future__ import annotations

from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

GAMMA_BASE_URL = "https://gamma-api.polymarket.com"
CLOB_BASE_URL = "https://clob.polymarket.com"


class PolymarketAPIError(RuntimeError):
    pass


class PolymarketClient:
    def __init__(
        self,
        gamma_base_url: str = GAMMA_BASE_URL,
        clob_base_url: str = CLOB_BASE_URL,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._gamma = gamma_base_url.rstrip("/")
        self._clob = clob_base_url.rstrip("/")
        self._timeout = timeout_seconds
        self._session = requests.Session()

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1.0),
        retry=retry_if_exception_type((requests.RequestException, PolymarketAPIError)),
    )
    def _get(self, base: str, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(f"{base}{path}", params=params, timeout=self._timeout)
        resp.raise_for_status()
        return resp.json()

    def list_markets(self, closed: bool = False, limit: int = 20) -> list[dict[str, Any]]:
        return self._get(self._gamma, "/markets", {"closed": str(closed).lower(), "limit": limit})

    def get_event(self, event_id: str) -> dict[str, Any]:
        return self._get(self._gamma, f"/events/{event_id}")

    def get_book(self, token_id: str) -> dict[str, Any]:
        return self._get(self._clob, "/book", {"token_id": token_id})

    def get_price(self, token_id: str, side: str) -> dict[str, Any]:
        return self._get(self._clob, "/price", {"token_id": token_id, "side": side})

    def get_midpoint(self, token_id: str) -> dict[str, Any]:
        return self._get(self._clob, "/midpoint", {"token_id": token_id})
