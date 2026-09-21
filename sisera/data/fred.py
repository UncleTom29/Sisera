"""FRED (Federal Reserve Economic Data, St. Louis Fed) client. See SCOPE.md §5.

Free, but requires a self-serve API key (instant signup: https://fred.stlouisfed.org/docs/api/api_key.html).
One integration covers the Fed funds rate, Treasury yields, and CPI -- FRED republishes
these series directly from the Fed/BLS/BEA, so this alone subsumes what would otherwise be
three separate agency integrations for the event-intelligence layer's macro-regime signal.

Endpoint shape confirmed live this session (GET .../fred/series/observations with a
correctly-formatted-but-unregistered api_key returns a clean "not registered" error, not a
parameter error -- confirming series_id/api_key/file_type/sort_order/limit are all valid
params). Never fabricates a reading on failure -- same policy as OpenRouterClient, for the
same reason: a caller can't distinguish a real reading from a made-up one, and unlike a
price series there's no honest "last known good" fallback to synthesize here either.
"""

from __future__ import annotations

import logging

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config

logger = logging.getLogger(__name__)

# FRED's sentinel for a missing/not-yet-published observation in a series.
_MISSING_VALUE = "."


class FREDClient:
    """Minimal FRED client scoped to what the macro-regime indicator needs: the latest
    value and a lagged value (for a delta) of a handful of series."""

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self._api_key = api_key if api_key is not None else config.fred_api_key
        self._base_url = base_url or config.fred_base_url
        self._session = requests.Session()

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _get_observations(self, series_id: str, limit: int) -> list[dict]:
        resp = self._session.get(
            f"{self._base_url}/series/observations",
            params={
                "series_id": series_id,
                "api_key": self._api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": limit,
            },
            timeout=config.http_timeout_seconds,
        )
        resp.raise_for_status()
        payload = resp.json()
        if "error_code" in payload:
            raise requests.RequestException(f"FRED error {payload['error_code']}: {payload.get('error_message')}")
        return payload.get("observations", [])

    def get_recent_observations(self, series_id: str, limit: int = 40) -> list[tuple[str, float]]:
        """Returns up to `limit` most recent (date, value) pairs, newest first, skipping
        FRED's missing-value sentinel rows. Returns [] on any failure (unconfigured,
        network error, unparseable) -- never a fabricated reading."""
        if not self.is_configured:
            logger.debug("FRED not configured (no API key) -- skipping %s", series_id)
            return []
        try:
            rows = self._get_observations(series_id, limit)
        except (requests.RequestException, ValueError) as exc:
            logger.warning("FRED fetch failed for %s: %s", series_id, exc)
            return []

        out: list[tuple[str, float]] = []
        for row in rows:
            value = row.get("value")
            if value is None or value == _MISSING_VALUE:
                continue
            try:
                out.append((row["date"], float(value)))
            except (KeyError, ValueError):
                continue
        return out

    def get_latest_observation(self, series_id: str) -> float | None:
        """Most recent non-missing value for `series_id`, or None on any failure."""
        obs = self.get_recent_observations(series_id, limit=5)
        return obs[0][1] if obs else None
