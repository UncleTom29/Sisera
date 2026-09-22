"""Tests for the Instrument Master repository."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import (
    CanonicalAsset,
    Instrument,
    InstrumentType,
    OptionType,
    VenueInstrument,
)
from sisera_domain.money import Asset
from sisera_instruments import Base, InstrumentRepository, create_db_engine, session_factory
from sqlalchemy.orm import Session


@pytest.fixture
def session() -> Session:
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = session_factory(engine)()
    try:
        yield session
    finally:
        session.close()


def _btc() -> CanonicalAsset:
    return CanonicalAsset(asset_id="asset_btc", symbol="BTC", name="Bitcoin")


def _perp() -> Instrument:
    return Instrument(
        instrument_id="bybit_btc_perp",
        canonical_asset_id="asset_btc",
        symbol="BTCUSDT",
        display_symbol="BTC-PERP",
        instrument_type=InstrumentType.PERPETUAL,
        base_asset=Asset("BTC"),
        quote_asset=Asset("USDT"),
        settlement_asset=Asset("USDT"),
        venue="bybit",
        tick_size=Decimal("0.5"),
        lot_size=Decimal("0.001"),
        funding_model="PERIODIC",  # type: ignore[arg-type]
        margin_model="ISOLATED",  # type: ignore[arg-type]
    )


def test_asset_and_instrument_round_trip(session: Session) -> None:
    repo = InstrumentRepository(session)
    repo.upsert_asset(_btc())
    repo.upsert_instrument(_perp())
    session.commit()

    asset = repo.get_asset("asset_btc")
    assert asset is not None and asset.symbol == "BTC"

    perp = repo.get_instrument("bybit_btc_perp")
    assert perp is not None
    assert perp.instrument_type == InstrumentType.PERPETUAL
    assert perp.tick_size == Decimal("0.5")
    assert perp.lot_size == Decimal("0.001")
    assert perp.base_asset == Asset("BTC")


def test_venue_instrument_upsert(session: Session) -> None:
    repo = InstrumentRepository(session)
    repo.upsert_asset(_btc())
    repo.upsert_venue_instrument(
        VenueInstrument(
            venue_instrument_id="okx_btc_spot",
            canonical_asset_id="asset_btc",
            venue="okx",
            venue_symbol="BTC-USDT",
            instrument_type=InstrumentType.SPOT,
            base_asset=Asset("BTC"),
            quote_asset=Asset("USDT"),
            settlement_asset=Asset("USDT"),
        )
    )
    session.commit()
    assert repo.instruments_for_asset("asset_btc") == []  # venue instrument != canonical instrument


def test_instrument_by_symbol(session: Session) -> None:
    repo = InstrumentRepository(session)
    repo.upsert_asset(_btc())
    repo.upsert_instrument(_perp())
    session.commit()
    assert repo.instrument_by_symbol("btcusdt").instrument_id == "bybit_btc_perp"


def test_option_instrument_strike_and_type(session: Session) -> None:
    repo = InstrumentRepository(session)
    repo.upsert_asset(_btc())
    repo.upsert_instrument(
        Instrument(
            instrument_id="deribit_btc_call",
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
    )
    session.commit()
    loaded = repo.get_instrument("deribit_btc_call")
    assert loaded.strike == Decimal("70000")
    assert loaded.option_type == OptionType.CALL


def test_upsert_is_idempotent(session: Session) -> None:
    repo = InstrumentRepository(session)
    repo.upsert_asset(_btc())
    repo.upsert_instrument(_perp())
    repo.upsert_instrument(_perp())  # no duplicate
    session.commit()
    assert repo.get_instrument("bybit_btc_perp") is not None
