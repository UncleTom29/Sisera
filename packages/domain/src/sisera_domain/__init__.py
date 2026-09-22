"""Sisera canonical domain financial types.

Implements ADR-002: monetary balances, quantities, prices, and fees are represented with
`decimal.Decimal` (fixed-point) rather than binary floating point. Binary float may be
used only for informational analytics (indicators, charting), and is converted to a
canonical representation at any domain or ledger boundary.

These value objects are the shared vocabulary the rest of Sisera operates on — exchange-
specific objects must never leak past the connector boundary (ADR-005).
"""

from sisera_domain.instrument import (
    CanonicalAsset,
    FundingModel,
    Instrument,
    InstrumentStatus,
    InstrumentType,
    MarginModel,
    OptionType,
    SymbolResolver,
    VenueInstrument,
)
from sisera_domain.ledger import EntryType, Ledger, LedgerEntry, Posting
from sisera_domain.money import (
    Asset,
    Money,
    Percentage,
    Price,
    Quantity,
    quantize_to_step,
    round_quantity_to_lot,
)

__all__ = [
    "Asset",
    "Money",
    "Percentage",
    "Price",
    "Quantity",
    "quantize_to_step",
    "round_quantity_to_lot",
    "CanonicalAsset",
    "FundingModel",
    "Instrument",
    "InstrumentStatus",
    "InstrumentType",
    "MarginModel",
    "OptionType",
    "SymbolResolver",
    "VenueInstrument",
    "EntryType",
    "Ledger",
    "LedgerEntry",
    "Posting",
]
