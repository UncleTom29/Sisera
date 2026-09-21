"""U.S. Treasury Fiscal Data client -- free, keyless. See SCOPE.md §5.

Confirmed live and keyless this session (GET .../v2/accounting/od/avg_interest_rates
returns 200 with real data, no API key, no registration, ever). Built for future use --
not currently wired into the scored macro-regime indicator (sisera/indicators/macro.py),
which uses FRED for yields/rates instead; none of the event-intelligence proposal's own
cited examples (oil, Fed expectations, 30Y yield) hinge on fiscal debt-issuance data
specifically over what FRED already covers. Kept here so a future indicator can reuse this
client without re-deriving the endpoint shape.
"""

from __future__ import annotations

import logging
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config

logger = logging.getLogger(__name__)


class TreasuryFiscalClient:
    """Free, keyless U.S. Treasury fiscal data with offline fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or config.treasury_fiscal_base_url
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._offline_mode:
            raise requests.ConnectionError("Treasury Fiscal Data offline fallback active")

        try:
            return self._retry_get(path, params)
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "Treasury Fiscal Data request to %s failed (%s); switching to offline mode", path, exc
            )
            self._offline_mode = True
            raise

    @retry(
        reraise=True,
        stop=stop_after_attempt(1),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _retry_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(f"{self._base_url}{path}", params=params, timeout=config.http_timeout_seconds)
        resp.raise_for_status()
        return resp.json()

    def get_avg_interest_rate(self, security_desc: str = "Treasury Notes") -> float | None:
        """Latest average interest rate for a marketable security type (e.g. "Treasury
        Bills", "Treasury Notes", "Treasury Bonds"). Returns None on any failure or if the
        requested security_desc isn't present in the latest record_date's rows."""
        try:
            result = self._get(
                "/v2/accounting/od/avg_interest_rates",
                params={"sort": "-record_date", "page[size]": 20},
            )
            for row in result.get("data", []):
                if row.get("security_desc") == security_desc:
                    return float(row["avg_interest_rate_amt"])
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Treasury avg interest rate fetch failed: %s", exc)
            return None
