from __future__ import annotations

import logging
from typing import Any

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from sisera.config import config
from sisera.data.models import CoinMarketData

logger = logging.getLogger(__name__)


class CoinPaprikaClient:
    """CoinPaprika free tier — market-cap fallback for CoinGecko. See SCOPE.md §3.

    Free tier is personal-use only per CoinPaprika's terms and capped around 20k
    calls/month — fine as an occasional fallback, not for redundant every-cycle calls.
    """

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or "https://api.coinpaprika.com/v1"
        self._session = requests.Session()

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(
            f"{self._base_url}{path}", params=params, timeout=config.http_timeout_seconds
        )
        resp.raise_for_status()
        return resp.json()

    def get_markets_by_symbol(self) -> dict[str, CoinMarketData]:
        """All coins in one call, keyed by uppercase ticker symbol.

        CoinPaprika's `/tickers` endpoint returns the full coin list (thousands of
        rows) in a single request — no pagination needed, unlike CoinGecko. Where a
        ticker collides across multiple coins (real risk in crypto), the
        highest-ranked (lowest `rank`) one wins, same policy as the Universe Manager
        applies to Bybit/CoinGecko ticker collisions.
        """
        rows = self._get("/tickers", {"quotes": "USD"})
        by_symbol: dict[str, CoinMarketData] = {}
        for row in rows:
            usd = row.get("quotes", {}).get("USD", {})
            market_cap = usd.get("market_cap")
            rank = row.get("rank")
            if market_cap is None or rank is None:
                continue
            symbol = row["symbol"].upper()
            existing = by_symbol.get(symbol)
            if existing is not None and existing.market_cap_rank <= rank:
                continue  # keep the higher-ranked (lower rank number) coin on collision
            by_symbol[symbol] = CoinMarketData(
                id=row["id"],
                symbol=row["symbol"],
                name=row["name"],
                market_cap=market_cap,
                market_cap_rank=rank,
                current_price=usd.get("price"),
                total_volume=usd.get("volume_24h"),
                circulating_supply=row.get("circulating_supply"),
                total_supply=row.get("total_supply"),
                max_supply=row.get("max_supply"),
            )
        logger.info("Fetched %d CoinPaprika market entries", len(by_symbol))
        return by_symbol
