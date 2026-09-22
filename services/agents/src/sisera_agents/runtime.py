"""Agent runtime (spec §22–24, §60).

Executes a governed agent loop: scan -> opportunity -> policy -> risk -> (approval) ->
paper execution -> monitor -> close -> attribution. Enforces lifecycle (no live trading
from DRAFT without override), autonomy levels (RESEARCH/SUGGEST cannot order; CONFIRM
requires approval; EMERGENCY_RISK_ONLY only reduces), and capital limits. Live venue
execution is out of scope here (paper only); the live path requires credentials + guard.
"""

from __future__ import annotations

import time
from decimal import Decimal
from typing import Protocol

from sisera_domain import (
    Agent,
    ApprovalEngine,
    AutonomyLevel,
    Decision,
    DecisionKind,
    DecisionLedger,
    LifecycleStage,
    MarketView,
    Opportunity,
    OpportunityEngine,
    OpportunityStructure,
    Order,
    OrderManager,
    OrderSide,
    OrderType,
    Portfolio,
    RiskEngine,
)
from sisera_domain.execution import PaperExecutionEngine


class PriceFeed(Protocol):
    def mark_price(self, instrument_id: str) -> Decimal | None: ...


class AgentBlocked(ValueError):
    pass


class AgentRuntime:
    def __init__(
        self,
        agent: Agent,
        opportunity_engine: OpportunityEngine | None = None,
        risk_engine: RiskEngine | None = None,
        paper: PaperExecutionEngine | None = None,
        oms: OrderManager | None = None,
        decisions: DecisionLedger | None = None,
        approval_engine: ApprovalEngine | None = None,
    ) -> None:
        self.agent = agent
        self.opportunities = opportunity_engine or OpportunityEngine()
        self.risk = risk_engine or RiskEngine()
        self.paper = paper or PaperExecutionEngine()
        self.oms = oms or OrderManager()
        self.decisions = decisions or DecisionLedger()
        self.approvals = approval_engine

    def _require_tradable_lifecycle(self) -> None:
        if self.agent.lifecycle_stage in {
            LifecycleStage.DRAFT,
            LifecycleStage.BACKTEST,
            LifecycleStage.STRESS_TEST,
        }:
            raise AgentBlocked(
                f"Agent {self.agent.agent_id} in {self.agent.lifecycle_stage.value} "
                "cannot trade (use PAPER/SHADOW/LIMITED_LIVE/LIVE)."
            )

    def _require_order_authority(self) -> None:
        if not self.agent.can_create_orders:
            raise AgentBlocked(
                f"Agent {self.agent.agent_id} at {self.agent.autonomy_level.value} "
                "cannot create orders."
            )

    def scan(self, views: list[MarketView]) -> list[Opportunity]:
        """Generate opportunities from market views (no execution)."""
        out: list[Opportunity] = []
        for i, view in enumerate(views):
            out.extend(self.opportunities.evaluate(view, f"{self.agent.agent_id}_{i}"))
        return out

    def execute(
        self,
        opportunity: Opportunity,
        portfolio: Portfolio,
        prices: PriceFeed,
        account_id: str = "agent",
    ) -> Order | None:
        """Evaluate and (if permitted) paper-execute one opportunity. Returns the filled
        order, or None if the policy/risk/approval/autonomy gates reject."""
        self._require_tradable_lifecycle()
        if opportunity.structure == OpportunityStructure.NO_TRADE:
            self._record(opportunity, DecisionKind.NO_TRADE, ("NO_TRADE_STRUCTURE",))
            return None
        try:
            self._require_order_authority()
        except AgentBlocked:
            self._record(opportunity, DecisionKind.NO_TRADE, ("AUTONOMY_DENIED",))
            return None

        if self.agent.autonomy_level == AutonomyLevel.EMERGENCY_RISK_ONLY:
            self._record(opportunity, DecisionKind.NO_TRADE, ("EMERGENCY_RISK_ONLY",))
            return None

        mark = prices.mark_price(opportunity.instrument_id)
        if mark is None or mark <= 0:
            self._record(opportunity, DecisionKind.NO_TRADE, ("NO_MARK_PRICE",))
            return None

        # Size from risk-per-trade capital limit.
        risk_fraction = self.agent.capital.risk_per_trade
        equity = portfolio.equity
        notional = equity * risk_fraction * Decimal("10")  # 10x = position from risk budget
        notional = min(notional, self.agent.capital.max_position_notional or notional)
        if notional <= 0:
            self._record(opportunity, DecisionKind.NO_TRADE, ("ZERO_SIZE",))
            return None

        quantity = notional / mark
        side = OrderSide.BUY if opportunity.direction == "LONG" else OrderSide.SELL
        order = self.oms.create_order(
            client_order_id=f"{self.agent.agent_id}_{opportunity.opportunity_id}",
            instrument_id=opportunity.instrument_id,
            side=side,
            order_type=OrderType.MARKET,
            quantity=quantity,
            account_id=account_id,
            portfolio_id=portfolio.portfolio_id,
            strategy_id=self.agent.manifest_id,
            agent_id=self.agent.agent_id,
        )

        risk_result = self.risk.check_pre_trade(order, portfolio, mark_price=mark)
        if not risk_result.approved:
            reasons = tuple(r.value for r in risk_result.reason_codes)
            self._record(opportunity, DecisionKind.REJECTED, reasons)
            return None

        if self.agent.requires_human_approval and self.approvals is not None:
            request = self.approvals.evaluate(order.sisera_order_id, self.agent.agent_id, notional)
            if not self.approvals.is_approved(request.request_id):
                self._record(opportunity, DecisionKind.WAIT, ("APPROVAL_PENDING",))
                return None

        filled = self.paper.submit(order, mid_price=mark)
        if filled.filled_quantity <= 0:
            self._record(opportunity, DecisionKind.NO_TRADE, ("NO_FILL",))
            return None

        self._record(opportunity, DecisionKind.TRADE, ("EXECUTED_PAPER",))
        return filled

    def _record(
        self, opportunity: Opportunity, kind: DecisionKind, reasons: tuple[str, ...]
    ) -> None:
        self.decisions.record(
            Decision(
                decision_id=f"dec_{self.agent.agent_id}_{opportunity.opportunity_id}",
                timestamp_ms=int(time.time() * 1000),
                instrument_id=opportunity.instrument_id,
                direction=opportunity.direction,
                kind=kind,
                strategy_version=str(self.agent.manifest_id or "v1"),
                model_version="v1",
                risk_policy_version="v1",
                execution_policy_version="paper_v1",
                confidence=opportunity.confidence,
                expected_value=opportunity.expected_value,
                uncertainty=opportunity.uncertainty,
                reason_codes=reasons,
            )
        )
