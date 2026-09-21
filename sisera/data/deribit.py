from __future__ import annotations

import logging
import time
from typing import Any

import pandas as pd
import requests
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from sisera.config import config
from sisera.data.models import DeribitOptionInstrument, DeribitOptionTicker

logger = logging.getLogger(__name__)


class DeribitAPIError(RuntimeError):
    """Raised when Deribit's API returns an `error` field after retries are exhausted."""


class DeribitClient:
    """Deribit public options market data with offline simulation fallback."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or "https://www.deribit.com/api/v2"
        self._session = requests.Session()
        self._offline_mode = False

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if self._offline_mode:
            raise requests.ConnectionError("Deribit offline fallback active")

        try:
            return self._retry_get(path, params)
        except (requests.RequestException, requests.ConnectionError) as exc:
            logger.debug("Deribit request to %s failed (%s); switching to offline mode", path, exc)
            self._offline_mode = True
            raise

    @retry(
        reraise=True,
        stop=stop_after_attempt(config.http_max_retries),
        wait=wait_exponential(multiplier=0.2, min=0.2, max=1),
        retry=retry_if_exception_type(requests.RequestException),
    )
    def _retry_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = self._session.get(f"{self._base_url}{path}", params=params, timeout=2.0)
        resp.raise_for_status()
        payload = resp.json()
        if "error" in payload:
            raise DeribitAPIError(f"{path} returned error: {payload['error']}")
        return payload["result"]

    def get_volatility_index_history_extended(
        self,
        currency: str,
        total_records: int = 4000,
        end_ms: int | None = None,
        resolution_seconds: int = 3600,
        max_requests: int = 20,
    ) -> pd.DataFrame:
        """Real historical DVOL (Deribit Volatility Index) via /public/get_volatility_index_data,
        paginated backward using the endpoint's own `continuation` cursor (same walk-backward
        shape as BybitClient's paginated fetchers, just a different cursor mechanism -- verified
        empirically: `continuation` is the `end_timestamp` to use for the next, earlier page,
        not a forward cursor). Needed so `implied_volatility` can score DVOL against a real
        trailing baseline in backtests instead of a single live snapshot with no history.

        Only BTC and ETH have Deribit options markets -- see indicators/options.py.
        """
        now_ms = int(time.time() * 1000)
        cursor_end = end_ms if end_ms is not None else now_ms
        page_span_ms = 1000 * resolution_seconds * 1000  # ~1000 bars/page at this resolution
        cursor_start = cursor_end - page_span_ms * max_requests  # generous lower bound

        frames: list[pd.DataFrame] = []
        collected = 0
        for _ in range(max_requests):
            if collected >= total_records:
                break
            try:
                result = self._get(
                    "/public/get_volatility_index_data",
                    {
                        "currency": currency,
                        "start_timestamp": cursor_start,
                        "end_timestamp": cursor_end,
                        "resolution": resolution_seconds,
                    },
                )
            except requests.RequestException:
                break

            rows = result.get("data", [])
            if not rows:
                break
            df = pd.DataFrame(rows, columns=["timestamp_ms", "open", "high", "low", "close"])
            frames.append(df)
            collected += len(df)

            continuation = result.get("continuation")
            if not continuation or continuation >= cursor_end:
                break
            cursor_end = continuation
            if len(rows) < 1000:
                break
            time.sleep(0.12)

        if not frames:
            return pd.DataFrame(columns=["dvol"])

        combined = pd.concat(frames, ignore_index=True).drop_duplicates(subset="timestamp_ms")
        combined["timestamp"] = pd.to_datetime(combined["timestamp_ms"], unit="ms", utc=True)
        combined = combined.sort_values("timestamp").set_index("timestamp")
        combined = combined.rename(columns={"close": "dvol"})[["dvol"]]
        if len(combined) > total_records:
            combined = combined.iloc[-total_records:]
        return combined

    def get_dvol(self, currency: str) -> float:
        try:
            index_name = f"{currency.lower()}dvol_usdc"
            result = self._get("/public/get_index_price", {"index_name": index_name})
            return float(result["index_price"])
        except requests.RequestException:
            return 52.5 if currency.upper() == "BTC" else 58.0

    def get_option_instruments(self, currency: str) -> list[DeribitOptionInstrument]:
        try:
            rows = self._get(
                "/public/get_instruments",
                {"currency": currency, "kind": "option", "expired": "false"},
            )
            return [
                DeribitOptionInstrument(
                    instrument_name=row["instrument_name"],
                    option_type=row["option_type"],
                    strike=float(row["strike"]),
                    expiration_timestamp_ms=int(row["expiration_timestamp"]),
                )
                for row in rows
            ]
        except requests.RequestException:
            # Synthetic option instruments for BTC/ETH
            now_ms = int(time.time() * 1000)
            exp_ms = now_ms + 7 * 86400 * 1000
            curr = currency.upper()
            base_p = 64000.0 if curr == "BTC" else 3400.0
            return [
                DeribitOptionInstrument(
                    instrument_name=f"{curr}-7D-{int(base_p * 1.05)}-C",
                    option_type="call",
                    strike=base_p * 1.05,
                    expiration_timestamp_ms=exp_ms,
                ),
                DeribitOptionInstrument(
                    instrument_name=f"{curr}-7D-{int(base_p * 0.95)}-P",
                    option_type="put",
                    strike=base_p * 0.95,
                    expiration_timestamp_ms=exp_ms,
                ),
            ]

    def get_option_ticker(self, instrument_name: str) -> DeribitOptionTicker | None:
        try:
            result = self._get("/public/ticker", {"instrument_name": instrument_name})
            mark_iv = result.get("mark_iv")
            delta = result.get("greeks", {}).get("delta")
            underlying_price = result.get("underlying_price")
            if mark_iv is None or delta is None or underlying_price is None:
                return None
            bid_p = float(result["best_bid_price"]) if result.get("best_bid_price") else None
            ask_p = float(result["best_ask_price"]) if result.get("best_ask_price") else None
            return DeribitOptionTicker(
                instrument_name=result["instrument_name"],
                mark_iv=float(mark_iv),
                delta=float(delta),
                underlying_price=float(underlying_price),
                best_bid_price=bid_p,
                best_ask_price=ask_p,
                timestamp_ms=int(result.get("timestamp", time.time() * 1000)),
            )
        except requests.RequestException:
            is_put = instrument_name.endswith("-P")
            return DeribitOptionTicker(
                instrument_name=instrument_name,
                mark_iv=54.0 if is_put else 51.0,
                delta=-0.25 if is_put else 0.25,
                underlying_price=64000.0,
                best_bid_price=0.02,
                best_ask_price=0.022,
                timestamp_ms=int(time.time() * 1000),
            )

    def get_near_money_option_tickers(
        self,
        currency: str,
        underlying_price: float,
        moneyness_band: float = 0.15,
        min_days_to_expiry: float = 2.0,
    ) -> list[DeribitOptionTicker]:
        instruments = self.get_option_instruments(currency)
        if not instruments:
            return []

        now_ms = int(time.time() * 1000)
        min_expiry_ms = now_ms + int(min_days_to_expiry * 86400 * 1000)

        valid_expiries = [
            inst.expiration_timestamp_ms
            for inst in instruments
            if inst.expiration_timestamp_ms >= min_expiry_ms
        ]
        if not valid_expiries:
            return []
        nearest_expiry = min(valid_expiries)

        lower_bound = underlying_price * (1.0 - moneyness_band)
        upper_bound = underlying_price * (1.0 + moneyness_band)

        eligible = [
            inst
            for inst in instruments
            if inst.expiration_timestamp_ms == nearest_expiry
            and lower_bound <= inst.strike <= upper_bound
        ]

        tickers: list[DeribitOptionTicker] = []
        for inst in eligible:
            ticker = self.get_option_ticker(inst.instrument_name)
            if ticker is not None:
                tickers.append(ticker)
        return tickers
