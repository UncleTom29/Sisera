"""EVM DEX venue adapter: aggregator quotes as canonical route legs."""

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
    src_token: str
    dst_token: str
    src_amount: Decimal
    dst_amount: Decimal
    estimated_gas: Decimal = Decimal("0")
    price_impact_bps: Decimal | None = None

    @property
    def effective_price(self) -> Decimal:
        return self.dst_amount / self.src_amount if self.src_amount > 0 else Decimal("0")


class EVMVenueAdapter:
    venue_id = "evm-dex"

    def __init__(self, client: Any, enabled: bool = False) -> None:
        self._client = client
        self._enabled = enabled

    @property
    def status(self) -> ConnectorStatus:
        return ConnectorStatus.EXPERIMENTAL if self._enabled else ConnectorStatus.DISABLED

    def _require_enabled(self) -> None:
        if not self._enabled:
            raise VenueUnavailable(
                "EVM DEX connector is disabled by default. Set SISERA_EVM_DEX_ENABLED=true "
                "for quote reads (no signing)."
            )

    def quote(self, src: str, dst: str, amount: Decimal) -> DexQuote:
        self._require_enabled()
        raw = self._client.quote(src, dst, str(amount))
        return DexQuote(
            venue_id=self.venue_id,
            src_token=src,
            dst_token=dst,
            src_amount=amount,
            dst_amount=Decimal(str(raw.get("dstAmount", 0))),
            estimated_gas=Decimal(str(raw.get("gas", 0))),
        )

    def execute_swap(self, *args: Any, **kwargs: Any) -> None:
        raise VenueUnavailable(
            "On-chain swap execution requires wallet signing + approvals (not wired). "
            "Quote-only."
        )
