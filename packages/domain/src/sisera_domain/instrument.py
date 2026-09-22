"""Instrument Master domain model (ADR-005).

A canonical `Instrument` is the only thing the rest of Sisera trades on. Exchange-specific
listings are represented separately as `VenueInstrument`; the economic asset is
`CanonicalAsset`. BTC spot on two exchanges maps to one canonical asset but two venue
instruments. Instruments are never inferred from a bare ticker — resolution goes through
`SymbolResolver`.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.money import Asset


class InstrumentType(StrEnum):
    SPOT = "SPOT"
    PERPETUAL = "PERPETUAL"
    FUTURE = "FUTURE"
    OPTION = "OPTION"
    TOKENIZED_EQUITY = "TOKENIZED_EQUITY"
    TOKENIZED_FUND = "TOKENIZED_FUND"
    RWA = "RWA"
    FX = "FX"
    COMMODITY = "COMMODITY"
    INDEX = "INDEX"
    PREDICTION_BINARY = "PREDICTION_BINARY"
    PREDICTION_MULTI_OUTCOME = "PREDICTION_MULTI_OUTCOME"
    PREDICTION_SCALAR = "PREDICTION_SCALAR"


class OptionType(StrEnum):
    CALL = "CALL"
    PUT = "PUT"


class InstrumentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    DELISTED = "DELISTED"


class MarginModel(StrEnum):
    ISOLATED = "ISOLATED"
    CROSS = "CROSS"
    NONE = "NONE"


class FundingModel(StrEnum):
    PERIODIC = "PERIODIC"
    CONTINUOUS = "CONTINUOUS"
    NONE = "NONE"


class CanonicalAsset(BaseModel):
    """The economic asset, independent of any venue listing (ADR-005)."""

    model_config = ConfigDict(frozen=True)

    asset_id: str
    symbol: str
    name: str
    asset_class: InstrumentType | None = None
    chain: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class VenueInstrument(BaseModel):
    """A specific venue's listing of a canonical asset."""

    model_config = ConfigDict(frozen=True)

    venue_instrument_id: str
    canonical_asset_id: str
    venue: str
    venue_symbol: str
    instrument_type: InstrumentType
    base_asset: Asset
    quote_asset: Asset
    settlement_asset: Asset
    contract_address: str | None = None
    status: InstrumentStatus = InstrumentStatus.ACTIVE
    tick_size: Decimal = Decimal("0.01")
    lot_size: Decimal = Decimal("1")
    price_precision: int = 2
    quantity_precision: int = 0
    metadata: dict[str, Any] = Field(default_factory=dict)


class Instrument(BaseModel):
    """The canonical instrument the rest of Sisera operates on (spec §8)."""

    model_config = ConfigDict(frozen=True)

    instrument_id: str
    canonical_asset_id: str
    symbol: str
    display_symbol: str
    instrument_type: InstrumentType
    base_asset: Asset
    quote_asset: Asset
    settlement_asset: Asset
    venue: str
    chain: str | None = None
    contract_address: str | None = None
    contract_multiplier: Decimal = Decimal("1")
    tick_size: Decimal = Decimal("0.01")
    lot_size: Decimal = Decimal("1")
    min_order_size: Decimal = Decimal("0")
    price_precision: int = 2
    quantity_precision: int = 0
    expiry: datetime | None = None
    strike: Decimal | None = None
    option_type: OptionType | None = None
    funding_model: FundingModel = FundingModel.NONE
    margin_model: MarginModel = MarginModel.NONE
    trading_calendar: str | None = None
    oracle: str | None = None
    collateral_rules: dict[str, Any] = Field(default_factory=dict)
    jurisdiction_tags: list[str] = Field(default_factory=list)
    status: InstrumentStatus = InstrumentStatus.ACTIVE
    metadata: dict[str, Any] = Field(default_factory=dict)

    def is_derivative(self) -> bool:
        return self.instrument_type in {
            InstrumentType.PERPETUAL,
            InstrumentType.FUTURE,
            InstrumentType.OPTION,
        }

    def is_prediction_market(self) -> bool:
        return self.instrument_type in {
            InstrumentType.PREDICTION_BINARY,
            InstrumentType.PREDICTION_MULTI_OUTCOME,
            InstrumentType.PREDICTION_SCALAR,
        }


class SymbolResolver:
    """Resolves ticker strings and aliases to canonical assets/instruments.

    Never infers an instrument from a bare ticker (ADR-005): resolution only succeeds for
    aliases that have been explicitly registered. Unregistered symbols raise `KeyError`.
    """

    def __init__(self) -> None:
        self._alias_to_asset: dict[str, str] = {}
        self._asset_id_to_symbol: dict[str, str] = {}
        self._instruments: dict[str, Instrument] = {}

    def register_asset(self, asset: CanonicalAsset, aliases: list[str] | None = None) -> None:
        self._asset_id_to_symbol[asset.asset_id] = asset.symbol
        for alias in [asset.symbol, *(aliases or [])]:
            self._alias_to_asset[alias.strip().upper()] = asset.asset_id

    def register_instrument(self, instrument: Instrument) -> None:
        self._instruments[instrument.instrument_id] = instrument
        self._alias_to_asset[instrument.symbol.strip().upper()] = instrument.canonical_asset_id
        self._alias_to_asset[instrument.display_symbol.strip().upper()] = instrument.canonical_asset_id

    def resolve_asset_id(self, symbol: str) -> str:
        key = symbol.strip().upper()
        if key not in self._alias_to_asset:
            raise KeyError(f"No canonical asset registered for symbol/alias {symbol!r}")
        return self._alias_to_asset[key]

    def canonical_symbol(self, asset_id: str) -> str:
        if asset_id not in self._asset_id_to_symbol:
            raise KeyError(f"No canonical symbol for asset id {asset_id!r}")
        return self._asset_id_to_symbol[asset_id]

    def get_instrument(self, instrument_id: str) -> Instrument:
        if instrument_id not in self._instruments:
            raise KeyError(f"Unknown instrument id {instrument_id!r}")
        return self._instruments[instrument_id]

    def instruments_for_asset(self, asset_id: str) -> list[Instrument]:
        return [i for i in self._instruments.values() if i.canonical_asset_id == asset_id]
