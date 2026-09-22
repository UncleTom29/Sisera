"""Settlement worker: posts execution fills and prediction settlements to the
double-entry financial ledger as balanced, per-asset-net-zero entries. Never mutates
posted entries; corrections are separate compensating entries.
"""

from __future__ import annotations

import time
from decimal import Decimal

from sisera_domain import (
    EntryType,
    LedgerEntry,
    Order,
    OrderSide,
    Posting,
    PredictionPosition,
    PredictionSettlement,
    settle_position,
)
from sisera_ledger import LedgerRepository


def _now_ms() -> int:
    return int(time.time() * 1000)


class SettlementJob:
    def __init__(self, ledger: LedgerRepository) -> None:
        self._ledger = ledger

    def settle_fill(
        self,
        order: Order,
        base_asset: str,
        quote_asset: str,
        entry_id: str | None = None,
    ) -> LedgerEntry:
        """Post a balanced FILL entry for a filled order.

        Quote leg (e.g. USDT): cash decreases by notional+fee, counterparty and fee
        accounts increase. Base leg (e.g. BTC): inventory and counterparty move
        oppositely. Both legs net to zero per asset.
        """
        if order.filled_quantity <= 0 or order.avg_fill_price is None:
            raise ValueError("Order has no fill to settle")
        notional = order.filled_quantity * order.avg_fill_price
        fee = order.fee_paid.amount if order.fee_paid else Decimal("0")
        buy = order.side == OrderSide.BUY

        quote_cash = -(notional + fee) if buy else (notional - fee)
        quote_counterparty = notional if buy else -notional
        base_inventory = order.filled_quantity if buy else -order.filled_quantity
        base_counterparty = -order.filled_quantity if buy else order.filled_quantity

        entry = LedgerEntry(
            entry_id=entry_id or f"fill_{order.sisera_order_id}",
            entry_type=EntryType.FILL,
            timestamp_ms=_now_ms(),
            reference_id=order.sisera_order_id,
            postings=(
                Posting("cash", quote_asset, quote_cash),
                Posting("counterparty", quote_asset, quote_counterparty),
                Posting("fee_account", quote_asset, fee),
                Posting("inventory", base_asset, base_inventory),
                Posting("counterparty", base_asset, base_counterparty),
            ),
        )
        return self._ledger.post(entry)

    def settle_prediction(
        self,
        position: PredictionPosition,
        settlement: PredictionSettlement,
        settlement_currency: str = "USDC",
        entry_id: str | None = None,
    ) -> LedgerEntry:
        """Post a balanced PREDICTION_SETTLEMENT entry for a resolved position."""
        payout = settle_position(position, settlement)
        entry = LedgerEntry(
            entry_id=entry_id or f"pred_{settlement.settlement_id}",
            entry_type=EntryType.PREDICTION_SETTLEMENT,
            timestamp_ms=_now_ms(),
            reference_id=position.position_id,
            postings=(
                Posting("cash", settlement_currency, payout),
                Posting("market", settlement_currency, -payout),
                Posting("position", position.outcome_id, -position.quantity),
                Posting("market", position.outcome_id, position.quantity),
            ),
        )
        return self._ledger.post(entry)
