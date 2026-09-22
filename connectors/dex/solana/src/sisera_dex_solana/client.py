"""Solana DEX aggregator quote client (Jupiter-style).

`GET {base}/swap/v2/order?inputMint=&outputMint=&amount=` with an `x-api-key` header.
Quote-only (no `taker`, so no transaction is assembled): execution/signing are out of
scope and raise. See `docs/connectors/dex-solana.md`.
"""

from __future__ import annotations

from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential


class DexAPIError(RuntimeError):
    pass


class SolanaQuoteClient:
    def __init__(
        self,
        base_url: str = "https://api.jup.ag/swap/v2",
        api_key: str = "",
        timeout_seconds: float = 10.0,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout_seconds
        self._session = requests.Session()

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1.0),
        retry=retry_if_exception_type((requests.RequestException, DexAPIError)),
    )
    def quote(self, input_mint: str, output_mint: str, amount: str) -> dict[str, Any]:
        resp = self._session.get(
            f"{self._base}/order",
            params={"inputMint": input_mint, "outputMint": output_mint, "amount": amount},
            headers={"x-api-key": self._api_key} if self._api_key else {},
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json()
