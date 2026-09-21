from __future__ import annotations

import pytest
import responses

from sisera.data.bybit import BybitAPIError, BybitClient

BASE_URL = "https://api.bybit.com"


def _instruments_payload(items: list[dict]) -> dict:
    return {
        "retCode": 0,
        "retMsg": "OK",
        "result": {"category": "linear", "list": items},
        "retExtInfo": {},
        "time": 1234567890,
    }


@responses.activate
def test_get_linear_perpetuals_filters_to_tradable_usdt_perpetuals():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/instruments-info",
        json=_instruments_payload(
            [
                {
                    "symbol": "BTCUSDT",
                    "contractType": "LinearPerpetual",
                    "status": "Trading",
                    "baseCoin": "BTC",
                    "quoteCoin": "USDT",
                },
                {
                    # not trading yet -> excluded
                    "symbol": "NEWUSDT",
                    "contractType": "LinearPerpetual",
                    "status": "PreLaunch",
                    "baseCoin": "NEW",
                    "quoteCoin": "USDT",
                },
                {
                    # dated future, not a perpetual -> excluded
                    "symbol": "BTC-25DEC26",
                    "contractType": "LinearFutures",
                    "status": "Trading",
                    "baseCoin": "BTC",
                    "quoteCoin": "USDT",
                },
                {
                    # USDC-margined, not USDT -> excluded
                    "symbol": "ETHPERP",
                    "contractType": "LinearPerpetual",
                    "status": "Trading",
                    "baseCoin": "ETH",
                    "quoteCoin": "USDC",
                },
            ]
        ),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    instruments = client.get_linear_perpetuals()

    assert len(instruments) == 1
    assert instruments[0].symbol == "BTCUSDT"
    assert instruments[0].base_coin == "BTC"


@responses.activate
def test_nonzero_retcode_raises_after_retries():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/instruments-info",
        json={"retCode": 10001, "retMsg": "params error", "result": {}},
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    with pytest.raises(BybitAPIError, match="10001"):
        client.get_linear_perpetuals()


def _envelope(result: dict) -> dict:
    return {"retCode": 0, "retMsg": "OK", "result": result, "retExtInfo": {}, "time": 1234567890}


@responses.activate
def test_get_orderbook_parses_bids_and_asks():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/orderbook",
        json=_envelope(
            {
                "s": "BTCUSDT",
                "b": [["50000.5", "1.2"], ["50000.0", "0.5"]],
                "a": [["50001.0", "0.8"], ["50001.5", "2.0"]],
                "ts": 1700000000000,
                "u": 42,
            }
        ),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    book = client.get_orderbook("BTCUSDT", depth=25)

    assert book.symbol == "BTCUSDT"
    assert book.best_bid == 50000.5
    assert book.best_ask == 50001.0
    assert book.mid_price == 50000.75
    assert len(book.bids) == 2
    assert len(book.asks) == 2


@responses.activate
def test_get_orderbook_handles_empty_book():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/orderbook",
        json=_envelope({"s": "OBSCUREUSDT", "b": [], "a": [], "ts": 1700000000000, "u": 1}),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    book = client.get_orderbook("OBSCUREUSDT")

    assert book.best_bid is None
    assert book.mid_price is None


@responses.activate
def test_get_ticker_parses_positioning_fields():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/tickers",
        json=_envelope(
            {
                "category": "linear",
                "list": [
                    {
                        "symbol": "BTCUSDT",
                        "lastPrice": "50000.0",
                        "markPrice": "50001.0",
                        "indexPrice": "49999.5",
                        "fundingRate": "0.0001",
                        "openInterest": "12345.6",
                        "bid1Price": "49999.9",
                        "ask1Price": "50000.1",
                    }
                ],
            }
        ),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    ticker = client.get_ticker("BTCUSDT")

    assert ticker.mark_price == 50001.0
    assert ticker.index_price == 49999.5
    assert ticker.funding_rate == 0.0001
    assert ticker.open_interest == 12345.6


@responses.activate
def test_get_ticker_raises_when_symbol_not_found():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/tickers",
        json=_envelope({"category": "linear", "list": []}),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    with pytest.raises(BybitAPIError, match="NOPEUSDT"):
        client.get_ticker("NOPEUSDT")


@responses.activate
def test_get_klines_sorts_ascending_and_parses_columns():
    # Bybit returns newest-first: deliberately out of order here to prove the
    # client re-sorts rather than trusting response order.
    rows = [
        ["1700003600000", "103", "104", "102", "103.5", "50", "5175"],
        ["1700000000000", "100", "101", "99", "100.5", "10", "1005"],
        ["1700001800000", "101", "102", "100", "101.5", "20", "2030"],
    ]
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/kline",
        json=_envelope({"symbol": "BTCUSDT", "category": "linear", "list": rows}),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    df = client.get_klines("BTCUSDT", "1h", limit=3)

    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df.index.is_monotonic_increasing
    assert df.iloc[0]["close"] == 100.5  # oldest first
    assert df.iloc[-1]["close"] == 103.5  # newest last
    assert df["close"].dtype == float


def test_get_klines_rejects_unsupported_timeframe():
    client = BybitClient(base_url=BASE_URL)
    with pytest.raises(ValueError, match="3m"):
        client.get_klines("BTCUSDT", "3m")


@responses.activate
def test_get_open_interest_history_sorts_ascending():
    rows = [
        {"symbol": "BTCUSDT", "openInterest": "12000", "timestamp": "1700003600000"},
        {"symbol": "BTCUSDT", "openInterest": "10000", "timestamp": "1700000000000"},
        {"symbol": "BTCUSDT", "openInterest": "11000", "timestamp": "1700001800000"},
    ]
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/open-interest",
        json=_envelope({"symbol": "BTCUSDT", "category": "linear", "list": rows}),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    df = client.get_open_interest_history("BTCUSDT", "1h")

    assert list(df.columns) == ["open_interest"]
    assert df.index.is_monotonic_increasing
    assert df.iloc[0]["open_interest"] == 10000.0
    assert df.iloc[-1]["open_interest"] == 12000.0


@responses.activate
def test_get_long_short_ratio_returns_most_recent():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/account-ratio",
        json=_envelope(
            {
                "list": [
                    {
                        "symbol": "BTCUSDT",
                        "buyRatio": "0.62",
                        "sellRatio": "0.38",
                        "timestamp": "1700000000000",
                    }
                ]
            }
        ),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    ratio = client.get_long_short_ratio("BTCUSDT")

    assert ratio.buy_ratio == 0.62
    assert ratio.sell_ratio == 0.38


@responses.activate
def test_get_long_short_ratio_raises_when_empty():
    responses.add(
        responses.GET,
        f"{BASE_URL}/v5/market/account-ratio",
        json=_envelope({"list": []}),
        status=200,
    )

    client = BybitClient(base_url=BASE_URL)
    with pytest.raises(BybitAPIError, match="NOPEUSDT"):
        client.get_long_short_ratio("NOPEUSDT")
