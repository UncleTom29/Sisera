"""EVM DEX aggregator quote client (1inch-style).

`GET {base}/v6.1/{chain_id}/quote?src=&dst=&amount=` with an API key. Quote-only: swap
calldata (`/swap`) and on-chain signing are out of scope and raise. See
`docs/connectors/dex-evm.md`.
"""

from __future__ import annotations

from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


class DexAPIError(RuntimeError):
    pass


class EVMQuoteClient:
    def __init__(
        self,
        base_url: str = "https://api.1inch.io",
        api_key: str = "",
        chain_id: int = 1,
        timeout_seconds: float = 10.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._chain_id = chain_id
        self._timeout = timeout_seconds
        self._session = requests.Session()

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1.0),
        retry=retry_if_exception_type((requests.RequestException, DexAPIError)),
    )
    def quote(self, src: str, dst: str, amount: str) -> dict[str, Any]:
        resp = self._session.get(
            f"{self._base}/v6.1/{self._chain_id}/quote",
            params={"src": src, "dst": dst, "amount": amount},
            headers={"Authorization": f"Bearer {self._api_key}"} if self._api_key else {},
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()
