"""Tests for canonical event schemas."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sisera_schemas import (
    Candle,
    DataQuality,
    FillEvent,
    LiquidationEvent,
    OrderCreated,
    OrderState,
    TradeTick,
)


def test_trade_tick_requires_source_and_instrument() -> None:
    with pytest.raises(ValidationError):
        TradeTick(price="100", quantity="1", side="buy")  # missing source/instrument_id


def test_trade_tick_has_provenance_fields() -> None:
    t = TradeTick(
        source="bybit",
        instrument_id="bybit_btc_perp",
        price="64250.5",
        quantity="0.1",
        side="buy",
        source_timestamp_ms=1,
        sequence=42,
    )
    assert t.event_timestamp_ms > 0
    assert t.ingestion_timestamp_ms > 0
    assert t.quality == DataQuality.LIVE
    assert t.sequence == 42
    assert t.price == Decimal("64250.5")


def test_candle_stale_quality_is_explicit() -> None:
    c = Candle(
        source="bybit",
        instrument_id="x",
        interval="1h",
        open="1",
        high="2",
        low="0.5",
        close="1.5",
        quality=DataQuality.STALE,
    )
    assert c.quality == DataQuality.STALE


def test_order_states_cover_full_lifecycle() -> None:
    expected = {
        "CREATED",
        "VALIDATING",
        "RISK_CHECK",
        "RISK_REJECTED",
        "APPROVAL_PENDING",
        "APPROVED",
        "ROUTING",
        "SUBMITTING",
        "ACKNOWLEDGED",
        "PARTIALLY_FILLED",
        "FILLED",
        "CANCEL_PENDING",
        "CANCELLED",
        "REJECTED",
        "EXPIRED",
        "UNKNOWN",
    }
    assert {s.value for s in OrderState} == expected


def test_order_created_carries_sources() -> None:
    o = OrderCreated(
        source="oms",
        instrument_id="bybit_btc_perp",
        sisera_order_id="ord_1",
        client_order_id="client_1",
        account_id="acct_1",
        portfolio_id="pf_1",
        side="buy",
        order_type="limit",
        quantity="0.5",
        price="64000",
        agent_id="agent_1",
    )
    assert o.agent_id == "agent_1"
    assert o.price == Decimal("64000")


def test_fill_event_defaults_fee_to_zero() -> None:
    f = FillEvent(
        source="bybit",
        instrument_id="x",
        sisera_order_id="ord_1",
        fill_id="f_1",
        quantity="0.1",
        price="100",
    )
    assert f.fee == Decimal("0")


def test_liquidation_event_is_typed() -> None:
    liq = LiquidationEvent(
        source="bybit",
        instrument_id="x",
        side="sell",
        quantity="10",
        price="64000",
    )
    assert liq.side == "sell"
