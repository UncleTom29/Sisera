"""Deterministic fixtures for Hyperliquid `/info` responses (no network)."""

from __future__ import annotations

from typing import Any


def meta_and_asset_ctxs() -> list[Any]:
    return [
        {
            "universe": [
                {"name": "BTC", "szDecimals": 5},
                {"name": "ETH", "szDecimals": 4},
            ]
        },
        [
            {"markPx": "64250.5", "funding": "0.00012", "openInterest": "1234.5"},
            {"markPx": "3480.0", "funding": "0.00008", "openInterest": "56789.0"},
        ],
    ]


def l2_book() -> dict[str, Any]:
    return {
        "levels": [
            [{"px": "64250.0", "sz": "1.5", "n": 3}],
            [{"px": "64251.0", "sz": "1.0", "n": 2}],
        ]
    }


def all_mids() -> dict[str, str]:
    return {"BTC": "64250.5", "ETH": "3480.0"}


def candles() -> list[dict[str, Any]]:
    return [
        {"t": 1700000000000, "o": "64000", "h": "64500", "l": "63900", "c": "64250", "v": "123.4"},
    ]


class FakeHyperliquidClient:
    def get_meta_and_asset_ctxs(self) -> tuple[list, list]:
        raw = meta_and_asset_ctxs()
        return raw[0].get("universe", []), raw[1]

    def get_l2_book(self, coin: str) -> dict[str, Any]:
        return l2_book()

    def get_all_mids(self) -> dict[str, str]:
        return all_mids()

    def get_candles(
        self, coin: str, interval: str, start_ms: int, end_ms: int
    ) -> list[dict[str, Any]]:
        return candles()

    def get_funding_history(
        self, coin: str, start_ms: int, end_ms: int | None = None
    ) -> list[dict[str, Any]]:
        return [{"coin": coin, "fundingRate": "0.00012", "time": start_ms}]
