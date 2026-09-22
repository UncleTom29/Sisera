"""Tests for the Instrument Master domain model (ADR-005)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sisera_domain import (
    Asset,
    CanonicalAsset,
    Instrument,
    InstrumentStatus,
    InstrumentType,
    OptionType,
    SymbolResolver,
    VenueInstrument,
)


def _btc_asset() -> CanonicalAsset:
    return CanonicalAsset(asset_id="asset_btc", symbol="BTC", name="Bitcoin")


def _btc_spot_bybit() -> VenueInstrument:
    return VenueInstrument(
        venue_instrument_id="bybit_btc_spot",
        canonical_asset_id="asset_btc",
        venue="bybit",
        venue_symbol="BTCUSDT",
        instrument_type=InstrumentType.SPOT,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("USDT"),
    )


def test_canonical_asset_vs_venue_instrument_are_distinct() -> None:
    asset = _btc_asset()
    bybit_spot = _btc_spot_bybit()
    # Same economic asset, two different venue listings would share canonical_asset_id.
    okx_spot = _btc_spot_bybit().model_copy(
        update={"venue_instrument_id": "okx_btc_spot", "venue": "okx"}
    )
    assert bybit_spot.canonical_asset_id == okx_spot.canonical_asset_id == asset.asset_id
    assert bybit_spot.venue != okx_spot.venue


def test_instrument_derivative_and_prediction_classifiers() -> None:
    perp = Instrument(
        instrument_id="bybit_btc_perp",
        canonical_asset_id="asset_btc",
        symbol="BTCUSDT",
        display_symbol="BTC-PERP",
        instrument_type=InstrumentType.PERPETUAL,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("USDT"),
        venue="bybit",
        funding_model="PERIODIC",  # type: ignore[arg-type]
        margin_model="ISOLATED",  # type: ignore[arg-type]
    )
    assert perp.is_derivative() is True
    assert perp.is_prediction_market() is False

    pred = Instrument(
        instrument_id="poly_fed_cut",
        canonical_asset_id="asset_fedcut",
        symbol="FEDCUT",
        display_symbol="Fed Cut?",
        instrument_type=InstrumentType.PREDICTION_BINARY,
        base_asset=Asset("YES"),
        quote_asset=Asset("USDC"),
        settlement_asset=Asset("USDC"),
        venue="polymarket",
    )
    assert pred.is_derivative() is False
    assert pred.is_prediction_market() is True


def test_option_instrument_carries_strike_and_type() -> None:
    opt = Instrument(
        instrument_id="deribit_btc_call_2026",
        canonical_asset_id="asset_btc",
        symbol="BTC-260626-70000-C",
        display_symbol="BTC 70k Call",
        instrument_type=InstrumentType.OPTION,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("BTC"),
        venue="deribit",
        strike=Decimal("70000"),
        option_type=OptionType.CALL,
    )
    assert opt.strike == Decimal("70000")
    assert opt.option_type == OptionType.CALL


def test_resolver_never_infers_unregistered_symbol() -> None:
    resolver = SymbolResolver()
    with pytest.raises(KeyError):
        resolver.resolve_asset_id("BTC")


def test_resolver_round_trip_with_aliases() -> None:
    resolver = SymbolResolver()
    resolver.register_asset(_btc_asset(), aliases=["XBT", "bitcoin"])
    assert resolver.resolve_asset_id("btc") == "asset_btc"
    assert resolver.resolve_asset_id("XBT") == "asset_btc"
    assert resolver.canonical_symbol("asset_btc") == "BTC"


def test_resolver_maps_venue_instruments_to_canonical_asset() -> None:
    resolver = SymbolResolver()
    resolver.register_asset(_btc_asset())
    perp = Instrument(
        instrument_id="bybit_btc_perp",
        canonical_asset_id="asset_btc",
        symbol="BTCUSDT",
        display_symbol="BTC-PERP",
        instrument_type=InstrumentType.PERPETUAL,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("USDT"),
        venue="bybit",
    )
    resolver.register_instrument(perp)
    # Both the venue symbol and the display symbol resolve to the canonical BTC asset.
    assert resolver.resolve_asset_id("BTCUSDT") == "asset_btc"
    assert resolver.resolve_asset_id("BTC-PERP") == "asset_btc"
    assert resolver.get_instrument("bybit_btc_perp") is perp
    assert resolver.instruments_for_asset("asset_btc") == [perp]


def test_instrument_status_enum() -> None:
    assert InstrumentStatus.ACTIVE.value == "ACTIVE"
    assert InstrumentStatus.DELISTED.value == "DELISTED"


def test_instrument_is_immutable() -> None:
    perp = Instrument(
        instrument_id="bybit_btc_perp",
        canonical_asset_id="asset_btc",
        symbol="BTCUSDT",
        display_symbol="BTC-PERP",
        instrument_type=InstrumentType.PERPETUAL,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("USDT"),
        venue="bybit",
    )
    with pytest.raises(ValidationError):
        perp.venue = "okx"  # type: ignore[misc]
