"""Solana DEX venue adapter: aggregator quotes as canonical route legs."""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict


class ConnectorStatus(StrEnum):
    PRODUCTION_READY = "PRODUCTION_READY"
    SANDBOX_VERIFIED = "SANDBOX_VERIFIED"
    PAPER_ONLY = "PAPER_ONLY"
    EXPERIMENTAL = "EXPERIMENTAL"
    DISABLED = "DISABLED"


class VenueUnavailable(RuntimeError):
    pass


class DexQuote(BaseModel):
    model_config = ConfigDict(frozen=True)

    venue_id: str
    input_mint: str
    output_mint: str
    in_amount: Decimal
    out_amount: Decimal
    price_impact_pct: Decimal | None = None
    router: str | None = None

    @property
    def effective_price(self) -> Decimal:
        return self.out_amount / self.in_amount if self.in_amount > 0 else Decimal("0")


class SolanaVenueAdapter:
    venue_id = "solana-dex"

    def __init__(self, client: Any, enabled: bool = False) -> None:
        self._client = client
        self._enabled = enabled

    @property
    def status(self) -> ConnectorStatus:
        return ConnectorStatus.EXPERIMENTAL if self._enabled else ConnectorStatus.DISABLED

    def _require_enabled(self) -> None:
        if not self._enabled:
            raise VenueUnavailable(
                "Solana DEX connector is disabled by default. Set "
                "SISERA_SOLANA_DEX_ENABLED=true for quote reads (no signing)."
            )

    def quote(self, input_mint: str, output_mint: str, amount: Decimal) -> DexQuote:
        self._require_enabled()
        raw = self._client.quote(input_mint, output_mint, str(amount))
        impact = raw.get("priceImpact")
        return DexQuote(
            venue_id=self.venue_id,
            input_mint=input_mint,
            output_mint=output_mint,
            in_amount=amount,
            out_amount=Decimal(str(raw.get("outAmount", 0))),
            price_impact_pct=Decimal(str(impact)) if impact is not None else None,
            router=str(raw.get("router")) if raw.get("router") else None,
        )

    def execute_swap(self, *args: Any, **kwargs: Any) -> None:
        raise VenueUnavailable(
            "On-chain swap execution requires wallet signing (not wired). Quote-only."
        )
