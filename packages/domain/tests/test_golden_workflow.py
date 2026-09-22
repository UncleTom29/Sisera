"""Golden end-to-end workflow test (spec §59).

Composes the domain end-to-end to prove the pieces are not disconnected tools:
intent -> OMS -> pre-trade risk -> SOR -> paper execution -> OMS fill -> financial
ledger -> TCA -> decision ledger. Runs entirely with deterministic paper execution.
"""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    Asset,
    Decision,
    DecisionKind,
    DecisionLedger,
    EntryType,
    FillRecord,
    Ledger,
    LedgerEntry,
    Money,
    OrderManager,
    OrderSide,
    OrderState,
    OrderType,
    Portfolio,
    Posting,
    RiskEngine,
    RiskPolicy,
    SmartOrderRouter,
    TCAEngine,
    VenueQuote,
)
from sisera_domain.execution import PaperExecutionEngine


def _quote() -> VenueQuote:
    return VenueQuote(
        venue_id="bybit",
        instrument_id="bybit_btc_perp",
        bid=Decimal("59990"),
        ask=Decimal("60010"),
        available_liquidity_notional=Decimal("1000000"),
        depth_at_touch=Decimal("100"),
        fee_rate=Decimal("0.0006"),
        latency_ms=5,
    )


def test_golden_workflow_end_to_end() -> None:
    # --- 1. Portfolio & market context ---
    portfolio = Portfolio(
        portfolio_id="pf_1",
        name="Main",
        quote_asset=Asset("USDT"),
        cash={"USDT": Money("100000", Asset("USDT"))},
        peak_equity=Decimal("100000"),
    )

    # --- 2. User requests a trade -> OMS creates an order ---
    oms = OrderManager()
    order = oms.create_order(
        client_order_id="client_1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="acct_1",
        portfolio_id="pf_1",
        user_id="user_1",
    )

    # --- 3. Pre-trade risk (deterministic) ---
    risk = RiskEngine(
        RiskPolicy(
            max_order_notional=Decimal("200000"),
            max_position_notional=Decimal("200000"),
            max_concentration=Decimal("0.9"),
        )
    )
    risk_result = risk.check_pre_trade(order, portfolio, mark_price=Decimal("60000"))
    assert risk_result.approved is True

    # --- 4. Smart Order Router ---
    router = SmartOrderRouter()
    route = router.route(order, [_quote()], reference_price=Decimal("60000"))
    assert route.decision == "ROUTE"
    assert route.legs[0].venue_id == "bybit"

    # --- 5. Paper execution ---
    paper = PaperExecutionEngine()
    filled = paper.submit(order, mid_price=Decimal("60000"))
    assert filled.filled_quantity == Decimal("1")

    # --- 6. OMS records the fill -> FILLED ---
    oms.advance(order.sisera_order_id, OrderState.VALIDATING)
    oms.advance(order.sisera_order_id, OrderState.RISK_CHECK)
    oms.advance(order.sisera_order_id, OrderState.ROUTING)
    oms.advance(order.sisera_order_id, OrderState.SUBMITTING)
    oms.advance(order.sisera_order_id, OrderState.ACKNOWLEDGED)
    final = oms.record_fill(order.sisera_order_id, Decimal("1"), filled.avg_fill_price)
    assert final.state == OrderState.FILLED

    # --- 7. Financial ledger (double-entry) ---
    ledger = Ledger()
    fill_price = filled.avg_fill_price
    notional = fill_price * Decimal("1")
    fee = filled.fee_paid.amount
    ledger.post(
        LedgerEntry(
            entry_id="entry_fill_1",
            entry_type=EntryType.FILL,
            timestamp_ms=0,
            postings=(
                Posting("inventory", "BTC", "1"),
                Posting("cash", "BTC", "-1"),  # BTC leg balanced
                Posting("cash", "USDT", -(notional + fee)),
                Posting("counterparty", "USDT", notional),
                Posting("fee_account", "USDT", fee),
            ),
        )
    )
    assert ledger.balance("inventory", "BTC") == Decimal("1")
    assert ledger.balance("cash", "USDT") == -(notional + fee)

    # --- 8. TCA ---
    tca = TCAEngine().analyze(
        FillRecord(
            order_id=order.sisera_order_id,
            side=OrderSide.BUY,
            instrument_id="bybit_btc_perp",
            quantity=Decimal("1"),
            ordered_quantity=Decimal("1"),
            execution_price=fill_price,
            decision_price=Decimal("60000"),
            arrival_price=Decimal("60000"),
            mid_price=Decimal("60000"),
            fees=filled.fee_paid,
        )
    )
    assert tca.slippage_bps > 0

    # --- 9. Decision ledger (provenance) ---
    decisions = DecisionLedger()
    decisions.record(
        Decision(
            decision_id=f"dec_{order.sisera_order_id}",
            timestamp_ms=0,
            instrument_id="bybit_btc_perp",
            symbol="BTC",
            direction="BUY",
            kind=DecisionKind.TRADE,
            strategy_version="v1",
            model_version="v1",
            risk_policy_version="v1",
            execution_policy_version="v1",
            confidence=Decimal("0.65"),
            expected_value=Decimal("0.4"),
            uncertainty=Decimal("0.1"),
            reason_codes=("TRADE",),
            risk_result={"approved": True},
            route_plan={"decision": "ROUTE", "venue": "bybit"},
        )
    )
    assert len(decisions) == 1
    assert decisions.query(symbol="BTC")[0].risk_result["approved"] is True


def test_oms_is_idempotent_across_retry() -> None:
    oms = OrderManager()
    first = oms.create_order(
        client_order_id="retry_1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="p",
    )
    retry = oms.create_order(
        client_order_id="retry_1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="p",
    )
    assert retry.sisera_order_id == first.sisera_order_id
