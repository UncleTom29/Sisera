from __future__ import annotations

import responses

from sisera.data.coingecko import CoinGeckoClient

BASE_URL = "https://api.coingecko.com/api/v3"


def _coin(rank: int) -> dict:
    return {
        "id": f"coin-{rank}",
        "symbol": f"c{rank}",
        "name": f"Coin {rank}",
        "market_cap": 1_000_000 / rank,
        "market_cap_rank": rank,
        "current_price": 1.23,
    }


@responses.activate
def test_get_top_markets_single_page():
    responses.add(
        responses.GET,
        f"{BASE_URL}/coins/markets",
        json=[_coin(i) for i in range(1, 51)],
        status=200,
    )

    client = CoinGeckoClient(base_url=BASE_URL)
    coins = client.get_top_markets(50)

    assert len(coins) == 50
    assert coins[0].id == "coin-1"
    assert coins[0].market_cap_rank == 1


@responses.activate
def test_get_top_markets_paginates_and_trims_to_count(mocker):
    mocker.patch("sisera.data.coingecko.time.sleep")  # skip real inter-page delay in tests

    full_page = [_coin(i) for i in range(1, 251)]
    second_page = [_coin(i) for i in range(251, 301)]
    responses.add(responses.GET, f"{BASE_URL}/coins/markets", json=full_page, status=200)
    responses.add(responses.GET, f"{BASE_URL}/coins/markets", json=second_page, status=200)

    client = CoinGeckoClient(base_url=BASE_URL)
    coins = client.get_top_markets(260)

    assert len(coins) == 260
    assert coins[-1].market_cap_rank == 260


@responses.activate
def test_empty_response_stops_pagination():
    responses.add(responses.GET, f"{BASE_URL}/coins/markets", json=[], status=200)

    client = CoinGeckoClient(base_url=BASE_URL)
    coins = client.get_top_markets(100)

    assert coins == []
