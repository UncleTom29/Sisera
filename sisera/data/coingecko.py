from __future__ import annotations

import logging
import time
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

_MAX_PER_PAGE = 250

_FALLBACK_MARKETS = [
    CoinMarketData(
        id="bitcoin",
        symbol="btc",
        name="Bitcoin",
        market_cap=1350000000000.0,
        market_cap_rank=1,
        current_price=64250.0,
        total_volume=35000000000.0,
        circulating_supply=19700000.0,
        total_supply=21000000.0,
        max_supply=21000000.0,
    ),
    CoinMarketData(
        id="ethereum",
        symbol="eth",
        name="Ethereum",
        market_cap=420000000000.0,
        market_cap_rank=2,
        current_price=3480.0,
        total_volume=18000000000.0,
        circulating_supply=120000000.0,
        total_supply=120000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="solana",
        symbol="sol",
        name="Solana",
        market_cap=70000000000.0,
        market_cap_rank=5,
        current_price=148.5,
        total_volume=4500000000.0,
        circulating_supply=470000000.0,
        total_supply=580000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="ripple",
        symbol="xrp",
        name="XRP",
        market_cap=33000000000.0,
        market_cap_rank=7,
        current_price=0.585,
        total_volume=1500000000.0,
        circulating_supply=56000000000.0,
        total_supply=100000000000.0,
        max_supply=100000000000.0,
    ),
    CoinMarketData(
        id="binancecoin",
        symbol="bnb",
        name="BNB",
        market_cap=85000000000.0,
        market_cap_rank=4,
        current_price=575.0,
        total_volume=1200000000.0,
        circulating_supply=145000000.0,
        total_supply=145000000.0,
        max_supply=200000000.0,
    ),
    CoinMarketData(
        id="dogecoin",
        symbol="doge",
        name="Dogecoin",
        market_cap=18000000000.0,
        market_cap_rank=8,
        current_price=0.125,
        total_volume=800000000.0,
        circulating_supply=145000000000.0,
        total_supply=145000000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="avalanche-2",
        symbol="avax",
        name="Avalanche",
        market_cap=11500000000.0,
        market_cap_rank=11,
        current_price=28.5,
        total_volume=450000000.0,
        circulating_supply=400000000.0,
        total_supply=445000000.0,
        max_supply=720000000.0,
    ),
    CoinMarketData(
        id="chainlink",
        symbol="link",
        name="Chainlink",
        market_cap=7500000000.0,
        market_cap_rank=14,
        current_price=12.4,
        total_volume=300000000.0,
        circulating_supply=600000000.0,
        total_supply=1000000000.0,
        max_supply=1000000000.0,
    ),
    CoinMarketData(
        id="near",
        symbol="near",
        name="NEAR Protocol",
        market_cap=5800000000.0,
        market_cap_rank=18,
        current_price=4.85,
        total_volume=250000000.0,
        circulating_supply=1200000000.0,
        total_supply=1200000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="sui",
        symbol="sui",
        name="Sui",
        market_cap=5200000000.0,
        market_cap_rank=20,
        current_price=1.95,
        total_volume=400000000.0,
        circulating_supply=2700000000.0,
        total_supply=10000000000.0,
        max_supply=10000000000.0,
    ),
    CoinMarketData(
        id="aptos",
        symbol="apt",
        name="Aptos",
        market_cap=4100000000.0,
        market_cap_rank=24,
        current_price=8.20,
        total_volume=200000000.0,
        circulating_supply=500000000.0,
        total_supply=1100000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="optimism",
        symbol="op",
        name="Optimism",
        market_cap=2100000000.0,
        market_cap_rank=42,
        current_price=1.65,
        total_volume=150000000.0,
        circulating_supply=1250000000.0,
        total_supply=4300000000.0,
        max_supply=4300000000.0,
    ),
    CoinMarketData(
        id="arbitrum",
        symbol="arb",
        name="Arbitrum",
        market_cap=1950000000.0,
        market_cap_rank=45,
        current_price=0.55,
        total_volume=120000000.0,
        circulating_supply=3500000000.0,
        total_supply=10000000000.0,
        max_supply=10000000000.0,
    ),
    CoinMarketData(
        id="render-token",
        symbol="render",
        name="Render",
        market_cap=2800000000.0,
        market_cap_rank=34,
        current_price=5.40,
        total_volume=160000000.0,
        circulating_supply=518000000.0,
        total_supply=532000000.0,
        max_supply=532000000.0,
    ),
    CoinMarketData(
        id="injective-protocol",
        symbol="inj",
        name="Injective",
        market_cap=2200000000.0,
        market_cap_rank=40,
        current_price=22.10,
        total_volume=110000000.0,
        circulating_supply=100000000.0,
        total_supply=100000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="celestia",
        symbol="tia",
        name="Celestia",
        market_cap=1100000000.0,
        market_cap_rank=65,
        current_price=5.15,
        total_volume=90000000.0,
        circulating_supply=215000000.0,
        total_supply=1060000000.0,
        max_supply=None,
    ),
    CoinMarketData(
        id="fetch-ai",
        symbol="fet",
        name="Artificial Superintelligence Alliance",
        market_cap=3400000000.0,
        market_cap_rank=28,
        current_price=1.35,
        total_volume=180000000.0,
        circulating_supply=2520000000.0,
        total_supply=2710000000.0,
        max_supply=2710000000.0,
    ),
    CoinMarketData(
        id="dogwifcoin",
        symbol="wif",
        name="dogwifhat",
        market_cap=1850000000.0,
        market_cap_rank=48,
        current_price=1.85,
        total_volume=300000000.0,
        circulating_supply=998000000.0,
        total_supply=998000000.0,
        max_supply=998000000.0,
    ),
    CoinMarketData(
        id="pepe",
        symbol="pepe",
        name="Pepe",
        market_cap=4000000000.0,
        market_cap_rank=25,
        current_price=0.0000095,
        total_volume=600000000.0,
        circulating_supply=420690000000000.0,
        total_supply=420690000000000.0,
        max_supply=420690000000000.0,
    ),
    CoinMarketData(
        id="shiba-inu",
        symbol="shib",
        name="Shiba Inu",
        market_cap=11000000000.0,
        market_cap_rank=12,
        current_price=0.0000185,
        total_volume=300000000.0,
        circulating_supply=589000000000000.0,
        total_supply=589000000000000.0,
        max_supply=None,
    ),
]


class CoinGeckoClient:
    """CoinGecko free-tier market-cap ranking with offline fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or config.coingecko_base_url
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._offline_mode:
            raise requests.ConnectionError("CoinGecko offline fallback active")

        try:
            return self._retry_get(path, params)
        except Exception as exc:  # noqa: BLE001
            logger.debug("CoinGecko request to %s failed (%s); switching to offline mode", path, exc)
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

    def get_top_markets(self, count: int) -> list[CoinMarketData]:
        coins: list[CoinMarketData] = []
        page = 1
        try:
            while len(coins) < count:
                data = self._get(
                    "/coins/markets",
                    {
                        "vs_currency": "usd",
                        "order": "market_cap_desc",
                        "per_page": _MAX_PER_PAGE,
                        "page": page,
                        "sparkline": "false",
                    },
                )
                if not data:
                    break
                for row in data:
                    coins.append(
                        CoinMarketData(
                            id=row["id"],
                            symbol=row["symbol"],
                            name=row["name"],
                            market_cap=row.get("market_cap"),
                            market_cap_rank=row.get("market_cap_rank"),
                            current_price=row.get("current_price"),
                            total_volume=row.get("total_volume"),
                            circulating_supply=row.get("circulating_supply"),
                            total_supply=row.get("total_supply"),
                            max_supply=row.get("max_supply"),
                        )
                    )
                page += 1
                if len(coins) < count:
                    time.sleep(1.5)
            return coins[:count]
        except Exception:  # noqa: BLE001
            pass

        return _FALLBACK_MARKETS[:count] if count <= len(_FALLBACK_MARKETS) else _FALLBACK_MARKETS
