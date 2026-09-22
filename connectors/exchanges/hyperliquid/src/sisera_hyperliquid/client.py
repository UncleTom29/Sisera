"""Hyperliquid `/info` client (read-only, no auth).

Implements the subset of the Hyperliquid info endpoint Sisera needs, per the official
docs (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint):
all requests are POST with a `{"type": ...}` JSON body against
`https://api.hyperliquid.xyz/info` (mainnet) or the testnet mirror. Writes (`/exchange`,
EIP-712 agent-wallet signing) are intentionally out of scope here — live order submission
requires credentials plus the `LiveTradingGuard` and is documented in
`docs/connectors/hyperliquid.md`.
"""

from __future__ import annotations

from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info"
TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info"


class HyperliquidAPIError(RuntimeError):
    pass


class HyperliquidClient:
    def __init__(
        self,
        base_url: str = MAINNET_INFO_URL,
        timeout_seconds: float = 10.0,
        max_retries: int = 3,
    ) -> None:
        self._base_url = base_url
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._session = requests.Session()

    def _post(self, payload: dict[str, Any]) -> Any:
        return self._retry_post(payload)

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1.0),
        retry=retry_if_exception_type((requests.RequestException, HyperliquidAPIError)),
    )
    def _retry_post(self, payload: dict[str, Any]) -> Any:
        resp = self._session.post(self._base_url, json=payload, timeout=self._timeout)
        resp.raise_for_status()
        return resp.json()

    def get_meta_and_asset_ctxs(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Returns (universe, asset_contexts): names/tick/lot + mark/funding/OI per perp."""
        result = self._post({"type": "metaAndAssetCtxs"})
        if not isinstance(result, list) or len(result) != 2:
            raise HyperliquidAPIError(f"Unexpected metaAndAssetCtxs shape: {type(result)}")
        return result[0].get("universe", []), result[1]

    def get_l2_book(self, coin: str) -> dict[str, Any]:
        return self._post({"type": "l2Book", "coin": coin})

    def get_all_mids(self) -> dict[str, str]:
        return self._post({"type": "allMids"})

    def get_candles(
        self, coin: str, interval: str, start_ms: int, end_ms: int
    ) -> list[dict[str, Any]]:
        return self._post(
            {
                "type": "candle",
                "coin": coin,
                "interval": interval,
                "startTime": start_ms,
                "endTime": end_ms,
            }
        )

    def get_funding_history(
        self, coin: str, start_ms: int, end_ms: int | None = None
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"type": "fundingHistory", "coin": coin, "startTime": start_ms}
        if end_ms is not None:
            payload["endTime"] = end_ms
        return self._post(payload)
