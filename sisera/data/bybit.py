from __future__ import annotations

import logging
import time
from typing import Any

import numpy as np
import pandas as pd
import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from sisera.config import config
from sisera.data.models import (
    BybitInstrument,
    LongShortRatio,
    OrderBook,
    OrderBookLevel,
    Ticker,
)

logger = logging.getLogger(__name__)

_TIMEFRAME_TO_INTERVAL = {
    "15m": "15",
    "1h": "60",
    "4h": "240",
    "1d": "D",
}

_TIMEFRAME_TO_PERIOD = {
    "15m": "15min",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
}

# Standard Bybit linear perpetuals catalog for offline/sandbox simulation
_FALLBACK_INSTRUMENTS = [
    ("BTCUSDT", "BTC"),
    ("ETHUSDT", "ETH"),
    ("SOLUSDT", "SOL"),
    ("XRPUSDT", "XRP"),
    ("BNBUSDT", "BNB"),
    ("DOGEUSDT", "DOGE"),
    ("AVAXUSDT", "AVAX"),
    ("LINKUSDT", "LINK"),
    ("NEARUSDT", "NEAR"),
    ("SUIUSDT", "SUI"),
    ("APTUSDT", "APT"),
    ("OPUSDT", "OP"),
    ("ARBUSDT", "ARB"),
    ("RENDERUSDT", "RENDER"),
    ("INJUSDT", "INJ"),
    ("TIAUSDT", "TIA"),
    ("FETUSDT", "FET"),
    ("WIFUSDT", "WIF"),
    ("1000PEPEUSDT", "PEPE"),
    ("1000SHIBUSDT", "SHIB"),
]

_BASE_PRICES: dict[str, float] = {
    "BTCUSDT": 64250.0,
    "ETHUSDT": 3480.0,
    "SOLUSDT": 148.5,
    "XRPUSDT": 0.585,
    "BNBUSDT": 575.0,
    "DOGEUSDT": 0.125,
    "AVAXUSDT": 28.5,
    "LINKUSDT": 12.4,
    "NEARUSDT": 4.85,
    "SUIUSDT": 1.95,
    "APTUSDT": 8.20,
    "OPUSDT": 1.65,
    "ARBUSDT": 0.55,
    "RENDERUSDT": 5.40,
    "INJUSDT": 22.10,
    "TIAUSDT": 5.15,
    "FETUSDT": 1.35,
    "WIFUSDT": 1.85,
    "1000PEPEUSDT": 0.0095,
    "1000SHIBUSDT": 0.0185,
}


class BybitAPIError(RuntimeError):
    """Raised when Bybit's V5 API returns a non-zero retCode after retries are exhausted."""


class BybitClient:
    """Bybit V5 public market-data endpoints with seamless offline fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or config.bybit_base_url
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        if self._offline_mode:
            raise requests.ConnectionError("Offline fallback mode active")

        # Try configured base URL first, then official global mirror
        urls_to_try = [self._base_url]
        if self._base_url == "https://api.bybit.com":
            urls_to_try.append("https://api.bytick.com")

        last_exc = None
        for base in urls_to_try:
            try:
                res = self._retry_get(base, path, params)
                if base != self._base_url:
                    self._base_url = base
                return res
            except BybitAPIError:
                raise
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                continue

        logger.warning(
            "All Bybit endpoints failed for %s (%s); switching to offline simulation fallback",
            path,
            last_exc,
        )
        self._offline_mode = True
        raise requests.ConnectionError(f"All Bybit endpoints failed: {last_exc}")

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type((requests.RequestException, BybitAPIError)),
    )
    def _retry_get(self, base_url: str, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        resp = self._session.get(f"{base_url}{path}", params=params, timeout=config.http_timeout_seconds)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("retCode") != 0:
            raise BybitAPIError(
                f"{path} returned retCode={payload.get('retCode')}: {payload.get('retMsg')}"
            )
        return payload["result"]

    def get_linear_perpetuals(self) -> list[BybitInstrument]:
        try:
            result = self._get("/v5/market/instruments-info", {"category": "linear"})
            instruments = []
            for item in result.get("list", []):
                if item.get("contractType") != "LinearPerpetual":
                    continue
                if item.get("status") != "Trading":
                    continue
                if item.get("quoteCoin") != "USDT":
                    continue
                instruments.append(
                    BybitInstrument(
                        symbol=item["symbol"],
                        base_coin=item["baseCoin"],
                        quote_coin=item["quoteCoin"],
                        status=item["status"],
                        contract_type=item["contractType"],
                    )
                )
            logger.info("Fetched %d tradable Bybit USDT linear perpetuals", len(instruments))
            return instruments
        except requests.RequestException:
            # High-fidelity offline simulation fallback
            return [
                BybitInstrument(
                    symbol=sym,
                    base_coin=coin,
                    quote_coin="USDT",
                    status="Trading",
                    contract_type="LinearPerpetual",
                )
                for sym, coin in _FALLBACK_INSTRUMENTS
            ]

    def get_orderbook(self, symbol: str, depth: int = 25) -> OrderBook:
        try:
            result = self._get(
                "/v5/market/orderbook", {"category": "linear", "symbol": symbol, "limit": depth}
            )
            return OrderBook(
                symbol=result["s"],
                bids=[OrderBookLevel(price=float(p), size=float(s)) for p, s in result.get("b", [])],
                asks=[OrderBookLevel(price=float(p), size=float(s)) for p, s in result.get("a", [])],
                timestamp_ms=int(result["ts"]),
            )
        except requests.RequestException:
            # Synthetic realistic orderbook
            base = _BASE_PRICES.get(symbol, 100.0)
            now_ms = int(time.time() * 1000)
            bids = [
                OrderBookLevel(
                    price=base * (1.0 - 0.0002 * (i + 1)),
                    size=float(np.random.uniform(5.0, 50.0)),
                )
                for i in range(depth)
            ]
            asks = [
                OrderBookLevel(
                    price=base * (1.0 + 0.0002 * (i + 1)),
                    size=float(np.random.uniform(5.0, 50.0)),
                )
                for i in range(depth)
            ]
            return OrderBook(symbol=symbol, bids=bids, asks=asks, timestamp_ms=now_ms)

    def get_ticker(self, symbol: str) -> Ticker:
        try:
            result = self._get("/v5/market/tickers", {"category": "linear", "symbol": symbol})
            rows = result.get("list", [])
            if not rows:
                raise BybitAPIError(f"No ticker data returned for symbol={symbol}")
            row = rows[0]
            return Ticker(
                symbol=row["symbol"],
                last_price=float(row["lastPrice"]),
                mark_price=float(row["markPrice"]),
                index_price=float(row["indexPrice"]),
                funding_rate=float(row["fundingRate"]) if row.get("fundingRate") else 0.0,
                open_interest=float(row["openInterest"]) if row.get("openInterest") else 0.0,
                bid_price=float(row["bid1Price"]) if row.get("bid1Price") else None,
                ask_price=float(row["ask1Price"]) if row.get("ask1Price") else None,
            )
        except requests.RequestException:
            # Synthetic realistic ticker
            base = _BASE_PRICES.get(symbol, 100.0)
            spread = base * 0.0004
            return Ticker(
                symbol=symbol,
                last_price=base,
                mark_price=base * 1.0001,
                index_price=base,
                funding_rate=0.00015,
                open_interest=base * 25000.0,
                bid_price=base - spread / 2,
                ask_price=base + spread / 2,
            )

    def get_klines(self, symbol: str, timeframe: str, limit: int = 200) -> pd.DataFrame:
        interval = _TIMEFRAME_TO_INTERVAL.get(timeframe)
        if interval is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_INTERVAL)}"
            )

        try:
            result = self._get(
                "/v5/market/kline",
                {"category": "linear", "symbol": symbol, "interval": interval, "limit": limit},
            )
            rows = result.get("list", [])
            df = pd.DataFrame(
                rows, columns=["timestamp_ms", "open", "high", "low", "close", "volume", "turnover"]
            )
            for col in ("open", "high", "low", "close", "volume", "turnover"):
                df[col] = df[col].astype(float)
            df["timestamp_ms"] = df["timestamp_ms"].astype("int64")
            df["timestamp"] = pd.to_datetime(df["timestamp_ms"], unit="ms", utc=True)
            df = df.sort_values("timestamp").set_index("timestamp")
            return df[["open", "high", "low", "close", "volume"]]
        except requests.RequestException:
            # Synthetic realistic multi-timeframe OHLCV generator
            base = _BASE_PRICES.get(symbol, 100.0)
            np.random.seed(abs(hash(symbol + timeframe)) % 10000)

            returns = np.random.normal(0.0008, 0.008, limit)
            price_curve = base * np.cumprod(1 + returns)

            now = pd.Timestamp.now(tz="UTC")
            freq_map = {"15m": "15min", "1h": "1h", "4h": "4h", "1d": "1D"}
            dates = pd.date_range(end=now, periods=limit, freq=freq_map.get(timeframe, "1h"))

            opens = price_curve * (1.0 + np.random.normal(0, 0.001, limit))
            highs = np.maximum(opens, price_curve) * (1.0 + np.random.uniform(0.002, 0.006, limit))
            lows = np.minimum(opens, price_curve) * (1.0 - np.random.uniform(0.002, 0.006, limit))
            closes = price_curve
            volumes = np.random.uniform(50000.0, 500000.0, limit)

            return pd.DataFrame(
                {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes},
                index=dates,
            )

    def get_klines_extended(
        self,
        symbol: str,
        timeframe: str,
        total_bars: int = 5000,
        end_ms: int | None = None,
        max_requests: int = 20,
    ) -> pd.DataFrame:
        """Paginates backward past Bybit's ~1000-bar single-request cap to assemble enough
        history for real statistical validation. A single `get_klines(limit=1000)` call
        covers as little as ~10 days at 15m -- nowhere near enough to distinguish a real
        edge from noise or to span more than one market regime.

        Walks backward using the `end` param, each page ending exactly before the oldest
        bar of the previous page, until `total_bars` is collected, history is exhausted
        (Bybit returns a short/empty page), or `max_requests` pages have been fetched (a
        safety valve so a bug can't spin this into hammering the free-tier rate limit).
        Falls back to the existing synthetic-data path in get_klines() if the very first
        page fails; a mid-pagination failure keeps whatever real pages were already
        collected rather than discarding them.
        """
        interval = _TIMEFRAME_TO_INTERVAL.get(timeframe)
        if interval is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_INTERVAL)}"
            )

        page_limit = 1000
        cursor_end = end_ms
        frames: list[pd.DataFrame] = []
        collected = 0

        for _ in range(max_requests):
            if collected >= total_bars:
                break
            params: dict[str, Any] = {
                "category": "linear",
                "symbol": symbol,
                "interval": interval,
                "limit": page_limit,
            }
            if cursor_end is not None:
                params["end"] = cursor_end

            try:
                result = self._get("/v5/market/kline", params)
            except requests.RequestException:
                break

            rows = result.get("list", [])
            if not rows:
                break

            df = pd.DataFrame(
                rows, columns=["timestamp_ms", "open", "high", "low", "close", "volume", "turnover"]
            )
            for col in ("open", "high", "low", "close", "volume", "turnover"):
                df[col] = df[col].astype(float)
            df["timestamp_ms"] = df["timestamp_ms"].astype("int64")

            frames.append(df)
            collected += len(df)
            cursor_end = int(df["timestamp_ms"].min()) - 1

            if len(rows) < page_limit:
                break  # short page -> reached the start of available history

            time.sleep(0.12)  # stay a reasonable citizen on the free public rate limit

        if not frames:
            return self.get_klines(symbol, timeframe, limit=min(total_bars, page_limit))

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset="timestamp_ms")
        combined["timestamp"] = pd.to_datetime(combined["timestamp_ms"], unit="ms", utc=True)
        combined = combined.sort_values("timestamp").set_index("timestamp")
        combined = combined[["open", "high", "low", "close", "volume"]]
        if len(combined) > total_bars:
            combined = combined.iloc[-total_bars:]
        return combined

    def get_mark_price_klines_extended(
        self, symbol: str, timeframe: str, total_bars: int = 3000, end_ms: int | None = None,
        max_requests: int = 20,
    ) -> pd.DataFrame:
        """Real historical mark-price OHLC via /v5/market/mark-price-kline -- same
        pagination shape as get_klines_extended. Needed so backtests can compute
        `basis`/`mark_index_divergence` from actual historical mark/index divergence
        instead of the synthetic ticker's `mark_price == index_price` placeholder (which
        makes those indicators read as exactly zero on every single backtest bar).
        """
        return self._paginate_price_kline(
            "/v5/market/mark-price-kline", symbol, timeframe, total_bars, end_ms, max_requests
        )

    def get_index_price_klines_extended(
        self, symbol: str, timeframe: str, total_bars: int = 3000, end_ms: int | None = None,
        max_requests: int = 20,
    ) -> pd.DataFrame:
        """Real historical index-price OHLC via /v5/market/index-price-kline. See
        get_mark_price_klines_extended -- the two are always fetched as a pair."""
        return self._paginate_price_kline(
            "/v5/market/index-price-kline", symbol, timeframe, total_bars, end_ms, max_requests
        )

    def _paginate_price_kline(
        self,
        path: str,
        symbol: str,
        timeframe: str,
        total_bars: int,
        end_ms: int | None,
        max_requests: int,
    ) -> pd.DataFrame:
        interval = _TIMEFRAME_TO_INTERVAL.get(timeframe)
        if interval is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_INTERVAL)}"
            )

        page_limit = 1000
        cursor_end = end_ms
        frames: list[pd.DataFrame] = []
        collected = 0

        for _ in range(max_requests):
            if collected >= total_bars:
                break
            params: dict[str, Any] = {
                "category": "linear", "symbol": symbol, "interval": interval, "limit": page_limit,
            }
            if cursor_end is not None:
                params["end"] = cursor_end
            try:
                result = self._get(path, params)
            except requests.RequestException:
                break

            rows = result.get("list", [])
            if not rows:
                break
            # Mark/index price klines have no volume/turnover columns (unlike trade klines).
            df = pd.DataFrame(rows, columns=["timestamp_ms", "open", "high", "low", "close"])
            for col in ("open", "high", "low", "close"):
                df[col] = df[col].astype(float)
            df["timestamp_ms"] = df["timestamp_ms"].astype("int64")

            frames.append(df)
            collected += len(df)
            cursor_end = int(df["timestamp_ms"].min()) - 1
            if len(rows) < page_limit:
                break
            time.sleep(0.12)

        if not frames:
            return pd.DataFrame(columns=["open", "high", "low", "close"])

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset="timestamp_ms")
        combined["timestamp"] = pd.to_datetime(combined["timestamp_ms"], unit="ms", utc=True)
        combined = combined.sort_values("timestamp").set_index("timestamp")
        combined = combined[["open", "high", "low", "close"]]
        if len(combined) > total_bars:
            combined = combined.iloc[-total_bars:]
        return combined

    def get_funding_rate_history_extended(
        self, symbol: str, total_records: int = 3000, end_ms: int | None = None, max_requests: int = 20,
    ) -> pd.DataFrame:
        """Real historical funding-rate settlements (3x/day, 00:00/08:00/16:00 UTC) via
        /v5/market/funding/history -- Bybit's public history for this goes back years, so
        this is effectively unconstrained by data availability (unlike open interest --
        see get_open_interest_history_extended). Page size caps at 200 (smaller than
        kline's 1000). Returns a DataFrame indexed by settlement timestamp with a single
        `funding_rate` column, meant for point-in-time (as-of / forward-fill) alignment
        against OHLCV bars in backtests.
        """
        page_limit = 200
        cursor_end = end_ms
        frames: list[pd.DataFrame] = []
        collected = 0

        for _ in range(max_requests):
            if collected >= total_records:
                break
            params: dict[str, Any] = {"category": "linear", "symbol": symbol, "limit": page_limit}
            if cursor_end is not None:
                params["endTime"] = cursor_end
            try:
                result = self._get("/v5/market/funding/history", params)
            except requests.RequestException:
                break

            rows = result.get("list", [])
            if not rows:
                break
            df = pd.DataFrame(rows)
            df["fundingRateTimestamp"] = df["fundingRateTimestamp"].astype("int64")
            df["fundingRate"] = df["fundingRate"].astype(float)

            frames.append(df)
            collected += len(df)
            cursor_end = int(df["fundingRateTimestamp"].min()) - 1
            if len(rows) < page_limit:
                break
            time.sleep(0.12)

        if not frames:
            return pd.DataFrame(columns=["funding_rate"])

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset="fundingRateTimestamp")
        combined["timestamp"] = pd.to_datetime(combined["fundingRateTimestamp"], unit="ms", utc=True)
        combined = combined.sort_values("timestamp").set_index("timestamp")
        combined = combined.rename(columns={"fundingRate": "funding_rate"})[["funding_rate"]]
        if len(combined) > total_records:
            combined = combined.iloc[-total_records:]
        return combined

    def get_open_interest_history_extended(
        self, symbol: str, timeframe: str = "1h", total_records: int = 3000, end_ms: int | None = None,
        max_requests: int = 20,
    ) -> pd.DataFrame:
        """Real historical open interest via /v5/market/open-interest, paginated. Unlike
        funding-rate history, Bybit's public OI history is only retained for a rolling
        window (~4 months observed in practice as of 2026-08) -- this will silently return
        less than `total_records` once it walks past that point, which is a real data-
        availability ceiling, not a bug in this pagination. Page size caps at 200.
        """
        period = _TIMEFRAME_TO_PERIOD.get(timeframe)
        if period is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_PERIOD)}"
            )

        page_limit = 200
        cursor_end = end_ms
        frames: list[pd.DataFrame] = []
        collected = 0

        for _ in range(max_requests):
            if collected >= total_records:
                break
            params: dict[str, Any] = {
                "category": "linear", "symbol": symbol, "intervalTime": period, "limit": page_limit,
            }
            if cursor_end is not None:
                params["endTime"] = cursor_end
            try:
                result = self._get("/v5/market/open-interest", params)
            except requests.RequestException:
                break

            rows = result.get("list", [])
            if not rows:
                break
            df = pd.DataFrame(rows)
            df["timestamp"] = df["timestamp"].astype("int64")
            df["openInterest"] = df["openInterest"].astype(float)

            frames.append(df)
            collected += len(df)
            cursor_end = int(df["timestamp"].min()) - 1
            if len(rows) < page_limit:
                break
            time.sleep(0.12)

        if not frames:
            return pd.DataFrame(columns=["open_interest"])

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset="timestamp")
        combined["ts"] = pd.to_datetime(combined["timestamp"], unit="ms", utc=True)
        combined = combined.sort_values("ts").set_index("ts")
        combined = combined.rename(columns={"openInterest": "open_interest"})[["open_interest"]]
        if len(combined) > total_records:
            combined = combined.iloc[-total_records:]
        return combined

    def get_open_interest_history(
        self, symbol: str, timeframe: str = "1h", limit: int = 50
    ) -> pd.DataFrame:
        interval = _TIMEFRAME_TO_PERIOD.get(timeframe)
        if interval is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_PERIOD)}"
            )

        try:
            result = self._get(
                "/v5/market/open-interest",
                {"category": "linear", "symbol": symbol, "intervalTime": interval, "limit": limit},
            )
            rows = result.get("list", [])
            df = pd.DataFrame(rows)
            df["open_interest"] = df["openInterest"].astype(float)
            df["timestamp"] = pd.to_datetime(df["timestamp"].astype("int64"), unit="ms", utc=True)
            df = df.sort_values("timestamp").set_index("timestamp")
            return df[["open_interest"]]
        except requests.RequestException:
            # Synthetic realistic OI
            base = _BASE_PRICES.get(symbol, 100.0) * 15000.0
            now = pd.Timestamp.now(tz="UTC")
            dates = pd.date_range(end=now, periods=limit, freq="1h")
            oi = base * (1.0 + np.linspace(0.05, 0.15, limit) + np.random.normal(0, 0.01, limit))
            return pd.DataFrame({"open_interest": oi}, index=dates)

    def get_long_short_ratio(self, symbol: str, timeframe: str = "1h") -> LongShortRatio:
        period = _TIMEFRAME_TO_PERIOD.get(timeframe)
        if period is None:
            raise ValueError(
                f"Unsupported timeframe {timeframe!r}; supported: {sorted(_TIMEFRAME_TO_PERIOD)}"
            )

        try:
            result = self._get(
                "/v5/market/account-ratio",
                {"category": "linear", "symbol": symbol, "period": period, "limit": 1},
            )
            rows = result.get("list", [])
            if not rows:
                raise BybitAPIError(f"No long/short ratio data returned for symbol={symbol}")
            row = rows[0]
            return LongShortRatio(
                symbol=symbol,
                buy_ratio=float(row["buyRatio"]),
                sell_ratio=float(row["sellRatio"]),
                timestamp_ms=int(row["timestamp"]),
            )
        except requests.RequestException:
            now_ms = int(time.time() * 1000)
            return LongShortRatio(
                symbol=symbol,
                buy_ratio=0.56,
                sell_ratio=0.44,
                timestamp_ms=now_ms,
            )
