from __future__ import annotations

import ccxt

from sisera.data.cross_venue import CrossVenueFundingClient


class _FakeExchange:
    def __init__(self, funding_rate: float | None = None, raise_error: Exception | None = None):
        self._funding_rate = funding_rate
        self._raise_error = raise_error
        self.requested_symbols: list[str] = []

    def fetch_funding_rate(self, symbol: str) -> dict:
        self.requested_symbols.append(symbol)
        if self._raise_error is not None:
            raise self._raise_error
        return {"symbol": symbol, "fundingRate": self._funding_rate, "fundingTimestamp": 1700000000000}


def test_returns_funding_rate_from_first_configured_exchange(mocker):
    fake = _FakeExchange(funding_rate=0.0001)
    mocker.patch("ccxt.binance", return_value=fake)

    client = CrossVenueFundingClient(exchange_ids=["binance"])
    result = client.get_funding_rate("BTC")

    assert result is not None
    assert result.exchange == "binance"
    assert result.funding_rate == 0.0001
    assert fake.requested_symbols == ["BTC/USDT:USDT"]


def test_falls_through_to_next_exchange_when_symbol_not_listed(mocker):
    binance = _FakeExchange(raise_error=ccxt.BadSymbol("no such market"))
    okx = _FakeExchange(funding_rate=0.0002)
    mocker.patch("ccxt.binance", return_value=binance)
    mocker.patch("ccxt.okx", return_value=okx)

    client = CrossVenueFundingClient(exchange_ids=["binance", "okx"])
    result = client.get_funding_rate("SOMEOBSCURECOIN")

    assert result is not None
    assert result.exchange == "okx"


def test_returns_none_when_no_configured_exchange_has_the_pair(mocker):
    binance = _FakeExchange(raise_error=ccxt.BadSymbol("no such market"))
    mocker.patch("ccxt.binance", return_value=binance)

    client = CrossVenueFundingClient(exchange_ids=["binance"])
    result = client.get_funding_rate("NOWHERECOIN")

    assert result is None


def test_network_error_on_one_exchange_does_not_prevent_trying_the_next(mocker):
    binance = _FakeExchange(raise_error=ccxt.NetworkError("timed out"))
    okx = _FakeExchange(funding_rate=0.0003)
    mocker.patch("ccxt.binance", return_value=binance)
    mocker.patch("ccxt.okx", return_value=okx)

    # SISERA_HTTP_MAX_RETRIES=1 (conftest.py) means one attempt, no backoff wait,
    # so this stays fast without needing to mock tenacity's wait function.
    client = CrossVenueFundingClient(exchange_ids=["binance", "okx"])
    result = client.get_funding_rate("BTC")

    assert result is not None
    assert result.exchange == "okx"
