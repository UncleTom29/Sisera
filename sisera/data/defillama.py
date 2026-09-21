"""DeFiLlama client -- free, keyless aggregate TVL data. See SCOPE.md §5.

Confirmed live and keyless this session (GET https://api.llama.fi/protocols and
GET https://api.llama.fi/v2/historicalChainTvl both return 200 with no API key, ever).
Used as one of the macro-regime indicator's four sub-signals (sisera/indicators/macro.py)
-- falling aggregate TVL is a rough risk-off proxy, complementing FRED's rates/yields data
with an on-chain-native signal. historicalChainTvl gives a real daily series directly, so
this doesn't need to accumulate its own snapshots over time the way onchain_activity_trend
(sisera/indicators/fundamental.py) has to for Blockchair's tx-count data.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config

logger = logging.getLogger(__name__)


class DeFiLlamaClient:
    """Free, keyless aggregate TVL stats with offline fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or config.defillama_base_url
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._offline_mode:
            raise requests.ConnectionError("DeFiLlama offline fallback active")

        try:
            return self._retry_get(path, params)
        except Exception as exc:  # noqa: BLE001
            logger.debug("DeFiLlama request to %s failed (%s); switching to offline mode", path, exc)
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

    def get_aggregate_tvl(self) -> float | None:
        """Sum of `tvl` across every listed protocol. Returns None (not a fabricated
        placeholder) on any failure -- this is a live macro read, not a price series with
        an obvious last-known-good fallback."""
        try:
            protocols = self._get("/protocols")
            return float(sum(p.get("tvl") or 0.0 for p in protocols))
        except Exception as exc:  # noqa: BLE001
            logger.warning("DeFiLlama aggregate TVL fetch failed: %s", exc)
            return None

    def get_historical_tvl(self, days_ago: int) -> float | None:
        """Aggregate TVL from ~`days_ago` days back, from the full daily history series
        (confirmed live/keyless this session). Returns the closest available day's value;
        None on any failure or if the series doesn't reach back that far."""
        try:
            series = self._get("/v2/historicalChainTvl")
            if not series:
                return None
            target_ts = time.time() - days_ago * 86400
            closest = min(series, key=lambda pt: abs(pt.get("date", 0) - target_ts))
            return float(closest["tvl"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("DeFiLlama historical TVL fetch failed: %s", exc)
            return None
