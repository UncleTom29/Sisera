"""Instrument Master repository (ADR-005).

Persists canonical assets, venue instruments, and instruments; resolves symbols/aliases
to canonical assets via the persisted `SymbolResolver` state.
"""

from __future__ import annotations

from decimal import Decimal

from sisera_domain.instrument import (
    CanonicalAsset,
    FundingModel,
    Instrument,
    InstrumentStatus,
    InstrumentType,
    MarginModel,
    OptionType,
    VenueInstrument,
)
from sisera_domain.money import Asset
from sqlalchemy import select
from sqlalchemy.orm import Session

from sisera_instruments.models import CanonicalAssetRow, InstrumentRow, VenueInstrumentRow


def asset_to_row(a: CanonicalAsset) -> CanonicalAssetRow:
    return CanonicalAssetRow(
        asset_id=a.asset_id,
        symbol=a.symbol,
        name=a.name,
        asset_class=a.asset_class.value if a.asset_class else None,
        chain=a.chain,
        metadata_json=a.metadata or None,
    )


def row_to_asset(row: CanonicalAssetRow) -> CanonicalAsset:
    return CanonicalAsset(
        asset_id=row.asset_id,
        symbol=row.symbol,
        name=row.name,
        asset_class=InstrumentType(row.asset_class) if row.asset_class else None,
        chain=row.chain,
        metadata=row.metadata_json or {},
    )


def instrument_to_row(i: Instrument) -> InstrumentRow:
    return InstrumentRow(
        instrument_id=i.instrument_id,
        canonical_asset_id=i.canonical_asset_id,
        symbol=i.symbol,
        display_symbol=i.display_symbol,
        instrument_type=i.instrument_type.value,
        base_asset=i.base_asset.code,
        quote_asset=i.quote_asset.code,
        settlement_asset=i.settlement_asset.code,
        venue=i.venue,
        chain=i.chain,
        contract_address=i.contract_address,
        contract_multiplier=i.contract_multiplier,
        tick_size=i.tick_size,
        lot_size=i.lot_size,
        min_order_size=i.min_order_size,
        price_precision=i.price_precision,
        quantity_precision=i.quantity_precision,
        expiry=i.expiry,
        strike=i.strike,
        option_type=i.option_type.value if i.option_type else None,
        funding_model=i.funding_model.value,
        margin_model=i.margin_model.value,
        trading_calendar=i.trading_calendar,
        oracle=i.oracle,
        collateral_rules_json=i.collateral_rules or None,
        jurisdiction_tags_json=i.jurisdiction_tags or None,
        status=i.status.value,
        metadata_json=i.metadata or None,
    )


def row_to_instrument(row: InstrumentRow) -> Instrument:
    return Instrument(
        instrument_id=row.instrument_id,
        canonical_asset_id=row.canonical_asset_id,
        symbol=row.symbol,
        display_symbol=row.display_symbol,
        instrument_type=InstrumentType(row.instrument_type),
        base_asset=Asset(row.base_asset),
        quote_asset=Asset(row.quote_asset),
        settlement_asset=Asset(row.settlement_asset),
        venue=row.venue,
        chain=row.chain,
        contract_address=row.contract_address,
        contract_multiplier=Decimal(row.contract_multiplier),
        tick_size=Decimal(row.tick_size),
        lot_size=Decimal(row.lot_size),
        min_order_size=Decimal(row.min_order_size),
        price_precision=row.price_precision,
        quantity_precision=row.quantity_precision,
        expiry=row.expiry,
        strike=Decimal(row.strike) if row.strike is not None else None,
        option_type=OptionType(row.option_type) if row.option_type else None,
        funding_model=FundingModel(row.funding_model),
        margin_model=MarginModel(row.margin_model),
        trading_calendar=row.trading_calendar,
        oracle=row.oracle,
        collateral_rules=row.collateral_rules_json or {},
        jurisdiction_tags=row.jurisdiction_tags_json or [],
        status=InstrumentStatus(row.status),
        metadata=row.metadata_json or {},
    )


def venue_to_row(v: VenueInstrument) -> VenueInstrumentRow:
    return VenueInstrumentRow(
        venue_instrument_id=v.venue_instrument_id,
        canonical_asset_id=v.canonical_asset_id,
        venue=v.venue,
        venue_symbol=v.venue_symbol,
        instrument_type=v.instrument_type.value,
        base_asset=v.base_asset.code,
        quote_asset=v.quote_asset.code,
        settlement_asset=v.settlement_asset.code,
        contract_address=v.contract_address,
        status=v.status.value,
        tick_size=v.tick_size,
        lot_size=v.lot_size,
        price_precision=v.price_precision,
        quantity_precision=v.quantity_precision,
        metadata_json=v.metadata or None,
    )


def row_to_venue(row: VenueInstrumentRow) -> VenueInstrument:
    return VenueInstrument(
        venue_instrument_id=row.venue_instrument_id,
        canonical_asset_id=row.canonical_asset_id,
        venue=row.venue,
        venue_symbol=row.venue_symbol,
        instrument_type=InstrumentType(row.instrument_type),
        base_asset=Asset(row.base_asset),
        quote_asset=Asset(row.quote_asset),
        settlement_asset=Asset(row.settlement_asset),
        contract_address=row.contract_address,
        status=InstrumentStatus(row.status),
        tick_size=Decimal(row.tick_size),
        lot_size=Decimal(row.lot_size),
        price_precision=row.price_precision,
        quantity_precision=row.quantity_precision,
        metadata=row.metadata_json or {},
    )


class InstrumentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_asset(self, asset: CanonicalAsset) -> CanonicalAsset:
        existing = self._session.get(CanonicalAssetRow, asset.asset_id)
        if existing is None:
            self._session.add(asset_to_row(asset))
        else:
            existing.symbol = asset.symbol
            existing.name = asset.name
        self._session.flush()
        return asset

    def upsert_instrument(self, instrument: Instrument) -> Instrument:
        existing = self._session.get(InstrumentRow, instrument.instrument_id)
        if existing is None:
            self._session.add(instrument_to_row(instrument))
        else:
            for k, v in instrument_to_row(instrument).__dict__.items():
                if not k.startswith("_") and k != "created_at":
                    setattr(existing, k, v)
        self._session.flush()
        return instrument

    def upsert_venue_instrument(self, v: VenueInstrument) -> VenueInstrument:
        existing = self._session.get(VenueInstrumentRow, v.venue_instrument_id)
        if existing is None:
            self._session.add(venue_to_row(v))
        else:
            for k, val in venue_to_row(v).__dict__.items():
                if not k.startswith("_"):
                    setattr(existing, k, val)
        self._session.flush()
        return v

    def get_instrument(self, instrument_id: str) -> Instrument | None:
        row = self._session.get(InstrumentRow, instrument_id)
        return row_to_instrument(row) if row is not None else None

    def get_asset(self, asset_id: str) -> CanonicalAsset | None:
        row = self._session.get(CanonicalAssetRow, asset_id)
        return row_to_asset(row) if row is not None else None

    def instrument_by_symbol(self, symbol: str) -> Instrument | None:
        row = self._session.scalars(
            select(InstrumentRow).where(InstrumentRow.symbol == symbol.upper())
        ).first()
        return row_to_instrument(row) if row is not None else None

    def instruments_for_asset(self, asset_id: str) -> list[Instrument]:
        rows = self._session.scalars(
            select(InstrumentRow).where(InstrumentRow.canonical_asset_id == asset_id)
        ).all()
        return [row_to_instrument(r) for r in rows]
