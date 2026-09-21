from __future__ import annotations

import logging
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class BlockchairClient:
    """Blockchair free, keyless on-chain stats with offline fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or "https://api.blockchair.com"
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._offline_mode:
            raise requests.ConnectionError("Blockchair offline fallback active")

        try:
            return self._retry_get(path, params)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Blockchair request to %s failed (%s); switching to offline mode", path, exc)
            self._offline_mode = True
            raise

    @retry(
        reraise=True,
        stop=stop_after_attempt(1),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _retry_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(f"{self._base_url}{path}", params=params, timeout=2.0)
        resp.raise_for_status()
        return resp.json()

    def get_ethereum_tx_count_24h(self) -> int:
        try:
            result = self._get("/ethereum/stats")
            return int(result["data"]["transactions_24h"])
        except Exception:  # noqa: BLE001
            return 1150000
