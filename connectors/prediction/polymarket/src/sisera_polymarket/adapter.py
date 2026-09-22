"""Polymarket venue adapter: Gamma markets -> canonical prediction domain + price events."""

from __future__ import annotations

import json
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sisera_domain.prediction import (
    MarketKind,
    MarketStatus,
    PredictionEvent,
    PredictionMarket,
    PredictionOutcome,
    ResolutionRule,
)
from sisera_schemas import DataQuality, PredictionPriceUpdate


class ConnectorStatus(StrEnum):
    PRODUCTION_READY = "PRODUCTION_READY"
    SANDBOX_VERIFIED = "SANDBOX_VERIFIED"
    PAPER_ONLY = "PAPER_ONLY"
    EXPERIMENTAL = "EXPERIMENTAL"
    DISABLED = "DISABLED"


class VenueUnavailable(RuntimeError):
    pass


def _parse_json_list(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return [str(x) for x in parsed] if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


class PolymarketVenueAdapter:
    venue_id = "polymarket"

    def __init__(self, client: Any, enabled: bool = False) -> None:
        self._client = client
        self._enabled = enabled

    @property
    def status(self) -> ConnectorStatus:
        return ConnectorStatus.EXPERIMENTAL if self._enabled else ConnectorStatus.DISABLED

    def _require_enabled(self) -> None:
        if not self._enabled:
            raise VenueUnavailable(
                "Polymarket connector is disabled by default. Set "
                "SISERA_POLYMARKET_ENABLED=true to enable public market-data reads. "
                "Authenticated trading is not wired."
            )

    def to_prediction_market(self, raw: dict[str, Any]) -> PredictionMarket:
        """Convert a Gamma `/markets` row into the canonical `PredictionMarket`."""
        outcomes = _parse_json_list(raw.get("outcomes"))
        prices = _parse_json_list(raw.get("outcomePrices"))
        clob_ids = _parse_json_list(raw.get("clobTokenIds"))
        built: list[PredictionOutcome] = []
        for i, label in enumerate(outcomes):
            prob = Decimal(prices[i]) if i < len(prices) else Decimal("0")
            outcome_id = clob_ids[i] if i < len(clob_ids) else label
            built.append(PredictionOutcome(outcome_id=outcome_id, label=label, probability=prob))
        closed = bool(raw.get("closed", False))
        return PredictionMarket(
            market_id=str(raw.get("id") or raw.get("conditionId") or raw.get("questionID") or ""),
            event_id=str(raw.get("eventId") or raw.get("id") or ""),
            kind=MarketKind.BINARY,
            outcomes=tuple(built),
            resolution_rule=ResolutionRule(
                rule_id=str(raw.get("id") or ""),
                description=str(raw.get("description") or raw.get("question") or ""),
                resolution_source="UMA",
            ),
            liquidity=Decimal(str(raw.get("liquidityNum") or raw.get("liquidity") or 0)),
            status=MarketStatus.RESOLVED if closed else MarketStatus.OPEN,
        )

    def to_prediction_event(self, raw: dict[str, Any]) -> PredictionEvent:
        return PredictionEvent(
            event_id=str(raw.get("id") or ""),
            question=str(raw.get("title") or raw.get("question") or ""),
            category=str(raw.get("category") or "") or None,
            description=str(raw.get("description") or "") or None,
        )

    def list_markets(self, limit: int = 20) -> list[PredictionMarket]:
        self._require_enabled()
        rows = self._client.list_markets(limit=limit)
        return [self.to_prediction_market(r) for r in rows]

    def price_updates(self, market: PredictionMarket) -> list[PredictionPriceUpdate]:
        """CLOB mid/book-implied probabilities per outcome as canonical price events."""
        self._require_enabled()
        updates: list[PredictionPriceUpdate] = []
        for outcome in market.outcomes:
            try:
                mid = self._client.get_midpoint(outcome.outcome_id)
                prob = Decimal(str(mid.get("mid", outcome.probability)))
            except Exception:  # noqa: BLE001
                prob = outcome.probability
            updates.append(
                PredictionPriceUpdate(
                    source=self.venue_id,
                    instrument_id=market.market_id,
                    quality=DataQuality.LIVE,
                    outcome_id=outcome.outcome_id,
                    probability=prob,
                    liquidity=market.liquidity,
                )
            )
        return updates

    def place_order(self, *args: Any, **kwargs: Any) -> None:
        raise VenueUnavailable(
            "Polymarket order placement requires L1+L2 authentication and a funded "
            "Polygon wallet (not configured). Public reads only."
        )
