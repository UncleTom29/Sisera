"""Deterministic Polymarket fixtures (no network)."""

from __future__ import annotations

from typing import Any


def gamma_market() -> dict[str, Any]:
    return {
        "id": "12345",
        "question": "Will CPI exceed 3.0% in June?",
        "description": "Resolves YES if June CPI YoY > 3.0%.",
        "outcomes": '["Yes", "No"]',
        "outcomePrices": '["0.62", "0.38"]',
        "clobTokenIds": '["1001", "1002"]',
        "liquidityNum": "250000",
        "closed": False,
        "eventId": "e99",
    }


def gamma_event() -> dict[str, Any]:
    return {
        "id": "e99",
        "title": "June CPI",
        "description": "June CPI release.",
        "category": "Economics",
    }


class FakePolymarketClient:
    def list_markets(self, limit: int = 20) -> list[dict[str, Any]]:
        return [gamma_market()]

    def get_event(self, event_id: str) -> dict[str, Any]:
        return gamma_event()

    def get_book(self, token_id: str) -> dict[str, Any]:
        return {"bids": [{"price": "0.61", "size": "100"}], "asks": [{"price": "0.63", "size": "100"}]}

    def get_price(self, token_id: str, side: str) -> dict[str, Any]:
        return {"price": "0.62"}

    def get_midpoint(self, token_id: str) -> dict[str, Any]:
        return {"mid": "0.62"}
