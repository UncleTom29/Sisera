from __future__ import annotations

import responses

from sisera.data.coinpaprika import CoinPaprikaClient

BASE_URL = "https://api.coinpaprika.com/v1"


def _ticker(id_: str, symbol: str, rank: int, market_cap: float) -> dict:
    return {
        "id": id_,
        "name": symbol,
        "symbol": symbol,
        "rank": rank,
        "quotes": {"USD": {"price": 1.23, "market_cap": market_cap}},
    }


@responses.activate
def test_get_markets_by_symbol_keys_on_uppercase_ticker():
    responses.add(
        responses.GET,
        f"{BASE_URL}/tickers",
        json=[
            _ticker("btc-bitcoin", "btc", 1, 1_000_000_000),
            _ticker("eth-ethereum", "eth", 2, 500_000_000),
        ],
        status=200,
    )

    client = CoinPaprikaClient(base_url=BASE_URL)
    markets = client.get_markets_by_symbol()

    assert set(markets.keys()) == {"BTC", "ETH"}
    assert markets["BTC"].market_cap == 1_000_000_000


@responses.activate
def test_duplicate_symbol_keeps_higher_ranked_coin():
    responses.add(
        responses.GET,
        f"{BASE_URL}/tickers",
        json=[
            _ticker("abc-real", "abc", 5, 100_000),
            _ticker("abc-scam", "abc", 900, 10),
        ],
        status=200,
    )

    client = CoinPaprikaClient(base_url=BASE_URL)
    markets = client.get_markets_by_symbol()

    assert markets["ABC"].market_cap_rank == 5


@responses.activate
def test_rows_missing_market_cap_are_skipped():
    responses.add(
        responses.GET,
        f"{BASE_URL}/tickers",
        json=[{"id": "x", "name": "X", "symbol": "x", "rank": 1, "quotes": {"USD": {}}}],
        status=200,
    )

    client = CoinPaprikaClient(base_url=BASE_URL)
    markets = client.get_markets_by_symbol()

    assert markets == {}
