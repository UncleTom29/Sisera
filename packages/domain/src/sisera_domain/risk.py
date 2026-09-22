"""Deterministic pre-trade risk engine (spec §16).

Risk is deterministic: this module is pure policy evaluation. It never depends on an LLM
or on external network calls. Inputs are the proposed order, the current portfolio state,
and a market-data freshness hint; outputs are a structured `RiskCheckResult` with reason
codes. An LLM cannot bypass this (ADR-008).
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.order import Order, OrderSide
from sisera_domain.portfolio import Portfolio


class RiskReason(StrEnum):
    OK = "OK"
    MAX_ORDER_SIZE = "MAX_ORDER_SIZE"
    MAX_POSITION_SIZE = "MAX_POSITION_SIZE"
    GROSS_EXPOSURE = "GROSS_EXPOSURE"
    NET_EXPOSURE = "NET_EXPOSURE"
    LEVERAGE_LIMIT = "LEVERAGE_LIMIT"
    ASSET_CONCENTRATION = "ASSET_CONCENTRATION"
    MARGIN = "MARGIN"
    DRAWDOWN = "DRAWDOWN"
    DAILY_LOSS = "DAILY_LOSS"
    STALE_DATA = "STALE_DATA"


class RiskPolicy(BaseModel):
    """Configurable pre-trade limits (spec §16)."""

    model_config = ConfigDict(frozen=True)

    max_order_notional: Decimal = Decimal("100000")
    max_position_notional: Decimal = Decimal("50000")
    max_gross_exposure: Decimal = Decimal("500000")
    max_net_exposure: Decimal = Decimal("250000")
    max_leverage: Decimal = Decimal("10")
    max_concentration: Decimal = Decimal("0.4")
    max_drawdown: Decimal = Decimal("0.15")
    max_daily_loss: Decimal = Decimal("0.05")
    max_data_age_ms: int = 30_000


class RiskCheckResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    approved: bool
    reason_codes: list[RiskReason] = Field(default_factory=list)
    order_notional: Decimal = Decimal("0")
    post_trade_gross_exposure: Decimal = Decimal("0")
    post_trade_leverage: Decimal = Decimal("0")
    post_trade_concentration: Decimal = Decimal("0")


class RiskEngine:
    """Deterministic pre-trade risk evaluation."""

    def __init__(self, policy: RiskPolicy | None = None) -> None:
        self.policy = policy or RiskPolicy()

    def check_pre_trade(
        self,
        order: Order,
        portfolio: Portfolio,
        *,
        mark_price: Decimal,
        data_age_ms: int = 0,
    ) -> RiskCheckResult:
        reasons: list[RiskReason] = []

        order_notional = order.quantity * mark_price
        post_gross = portfolio.gross_exposure + order_notional
        post_equity = portfolio.equity
        post_leverage = post_gross / post_equity if post_equity > 0 else Decimal("0")

        if data_age_ms > self.policy.max_data_age_ms:
            reasons.append(RiskReason.STALE_DATA)

        if order_notional > self.policy.max_order_notional:
            reasons.append(RiskReason.MAX_ORDER_SIZE)

        # Post-trade position size for this instrument.
        existing = portfolio.positions.get(order.instrument_id)
        existing_notional = existing.notional if existing else Decimal("0")
        if existing_notional + order_notional > self.policy.max_position_notional:
            reasons.append(RiskReason.MAX_POSITION_SIZE)

        if post_gross > self.policy.max_gross_exposure:
            reasons.append(RiskReason.GROSS_EXPOSURE)

        net = portfolio.net_exposure
        signed_new = order_notional if order.side == OrderSide.BUY else -order_notional
        if abs(net + signed_new) > self.policy.max_net_exposure:
            reasons.append(RiskReason.NET_EXPOSURE)

        if post_leverage > self.policy.max_leverage:
            reasons.append(RiskReason.LEVERAGE_LIMIT)

        other_notionals = [
            p.notional
            for iid, p in portfolio.positions.items()
            if iid != order.instrument_id
        ]
        largest_notional = max(
            [*other_notionals, existing_notional + order_notional],
            default=order_notional,
        )
        post_concentration = largest_notional / post_equity if post_equity > 0 else Decimal("0")
        if post_concentration > self.policy.max_concentration:
            reasons.append(RiskReason.ASSET_CONCENTRATION)

        if portfolio.current_drawdown > self.policy.max_drawdown:
            reasons.append(RiskReason.DRAWDOWN)

        return RiskCheckResult(
            approved=len(reasons) == 0,
            reason_codes=reasons,
            order_notional=order_notional,
            post_trade_gross_exposure=post_gross,
            post_trade_leverage=post_leverage,
            post_trade_concentration=post_concentration,
        )
