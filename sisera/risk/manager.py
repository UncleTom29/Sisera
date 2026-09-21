"""Portfolio Construction and Risk Manager. See SCOPE.md §9.

Handles Kelly-inspired position sizing, isolated margin leverage determination,
scenario-based liquidation buffer checks, ATR trailing stops with DVOL widening,
correlation and beta factor limits, circuit breakers, regime leverage throttling,
and pre-trade portfolio scenario stress tests.
"""

from __future__ import annotations

import logging

from sisera.config import config
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.models import (
    PortfolioState,
    Position,
    PositionSizingResult,
    StressTestResult,
)
from sisera.risk.profit_lock import CapitalMode, ProfitLockEngine, WeeklyLadderState

logger = logging.getLogger(__name__)

# Historical cluster cascade size benchmarks (average sudden liquidation cascade wick %)
_CLUSTER_CASCADE_SIZES = {
    "large_cap": 0.04,  # 4% cascade wick
    "mid_cap": 0.08,  # 8% cascade wick
    "small_cap": 0.14,  # 14% cascade wick
}

# Maintenance margin rates for Bybit perpetuals
_MAINTENANCE_MARGIN_RATES = {
    "large_cap": 0.005,  # 0.5% (BTC/ETH)
    "mid_cap": 0.010,  # 1.0%
    "small_cap": 0.020,  # 2.0%
}


class RiskManager:
    """Derivatives-native Portfolio Construction and Risk Management Engine."""

    def __init__(
        self,
        max_leverage: float | None = None,
        kelly_multiplier: float | None = None,
        max_pos_notional_pct: float | None = None,
        max_total_notional_pct: float | None = None,
        max_drawdown_pct: float | None = None,
        max_margin_ratio: float | None = None,
        max_daily_trades: int | None = None,
        top_n_size: int | None = None,
    ) -> None:
        self.max_leverage = max_leverage or config.max_leverage_ceiling
        self.kelly_multiplier = kelly_multiplier or config.kelly_multiplier
        self.max_pos_notional_pct = max_pos_notional_pct or config.max_position_notional_pct
        self.max_total_notional_pct = max_total_notional_pct or config.max_total_notional_pct
        self.max_drawdown_pct = max_drawdown_pct or config.max_portfolio_drawdown_pct
        self.max_margin_ratio = max_margin_ratio or config.max_portfolio_margin_ratio
        self.max_daily_trades = max_daily_trades or config.max_daily_trades
        self.top_n_size = top_n_size or config.top_n_portfolio_size
        self.profit_lock_engine = ProfitLockEngine(weekly_start_capital=100.0)

    def check_circuit_breakers(self, portfolio: PortfolioState) -> tuple[bool, list[str]]:
        """Evaluates portfolio-level circuit breakers (§9)."""
        reasons: list[str] = []

        if portfolio.current_drawdown_pct > self.max_drawdown_pct:
            dd_curr = portfolio.current_drawdown_pct
            reasons.append(f"Max drawdown breached: {dd_curr:.1%} > {self.max_drawdown_pct:.1%}")
        if portfolio.margin_ratio > self.max_margin_ratio:
            reasons.append(
                f"Max margin ratio breached: {portfolio.margin_ratio:.1%} > {self.max_margin_ratio:.1%}"
            )
        if portfolio.daily_trades_count >= self.max_daily_trades:
            reasons.append(
                f"Daily trade limit reached: {portfolio.daily_trades_count} >= {self.max_daily_trades}"
            )

        passed = len(reasons) == 0
        return passed, reasons

    def size_position(
        self,
        opportunity: Opportunity,
        portfolio: PortfolioState,
        atr_value: float | None = None,
        dvol: float | None = None,
        dvol_baseline: float | None = None,
        cluster: str = "large_cap",
        regime_transitioning: bool = False,
        size_multiplier: float = 1.0,
    ) -> PositionSizingResult:
        """Determines notional size, leverage, isolated margin, and liquidation buffer using Risk-First Sizing."""
        rejection_reasons: list[str] = []

        # 0. Position Capacity Limit -- unified across all account sizes on top_n_size
        # (config.top_n_portfolio_size). Previously additionally restricted sub-$250
        # accounts to 2 concurrent full-size positions regardless of top_n_size, which
        # blocked most qualifying candidates once 2 positions were open on a small
        # account -- risk at that account size is already bounded by
        # max_position_notional_pct/max_total_notional_pct/correlation-cluster exposure
        # below, so a separate, stricter position-count ceiling on top of those wasn't
        # buying anything except missed opportunities. Loosened at explicit user request.
        # Probe-sized (<=35%) trades still get some extra room since they carry less risk
        # per slot.
        effective_max_positions = self.top_n_size + 2 if size_multiplier <= 0.35 else self.top_n_size

        if len(portfolio.open_positions) >= effective_max_positions:
            rejection_reasons.append(
                f"Max concurrent positions reached for account tier (${portfolio.equity:.2f}): {len(portfolio.open_positions)} >= {effective_max_positions}"
            )

        # 1. Evaluate Dynamic Drawdown Ladder
        ladder_state = self.profit_lock_engine.evaluate_state(portfolio.equity)
        dd_multiplier = ladder_state.drawdown_sizing_multiplier
        if dd_multiplier <= 0.0:
            rejection_reasons.append(f"Trading halted by weekly risk ladder ({ladder_state.status_summary})")

        # 2. Risk-First Sizing ($ Risk -> Stop Distance % -> Notional Size)
        # Base risk budget: 2.0% (standard) to 3.5% (high conviction), scaled by size_multiplier
        base_risk_pct = 0.035 if opportunity.p_win >= 0.65 else 0.020
        risk_pct = base_risk_pct * dd_multiplier * size_multiplier * (1.0 - 0.5 * opportunity.epistemic_uncertainty)
        dollar_risk = portfolio.equity * risk_pct

        # 3. Stop Distance with DVOL Forward Widening (§9)
        entry_p = opportunity.entry_price
        atr = atr_value or (entry_p * 0.02)
        atr_mult = config.atr_stop_multiplier

        is_options_asset = opportunity.symbol.upper().startswith(("BTC", "ETH"))
        if is_options_asset and dvol and dvol_baseline and dvol > dvol_baseline * 1.15:
            atr_mult *= config.dvol_widen_factor

        stop_dist = max(atr * atr_mult, entry_p * 0.015)
        stop_dist_pct = max(0.01, stop_dist / entry_p)

        initial_stop = (
            (entry_p - stop_dist)
            if opportunity.direction == TradeDirection.LONG
            else (entry_p + stop_dist)
        )

        # Target Notional = Dollar Risk / Stop Distance %
        target_notional = dollar_risk / stop_dist_pct
        pos_notional_cap = portfolio.equity * max(self.max_pos_notional_pct, 0.40)
        notional_size = min(target_notional, pos_notional_cap)

        # Check against total exposure cap
        available_notional = max(
            0.0, portfolio.equity * self.max_total_notional_pct - portfolio.total_notional_exposure
        )
        notional_size = min(notional_size, available_notional)

        if notional_size < 10.0:
            rejection_reasons.append(f"Notional size too small (${notional_size:.2f})")

        # 4. Leverage Determination & Regime Throttle (§9) -- confidence-scaled.
        # Previously a flat per-cluster lookup (always exactly 3x for any non-BTC/ETH
        # asset, 5x for BTC/ETH) regardless of signal strength -- a p_win=52% trade got
        # the same leverage as a p_win=68% one. Now scales from a floor (identical to the
        # old flat values, so a barely-qualifying trade is no riskier than before) up
        # toward a cluster ceiling as conviction (p_win) rises. BTC/ETH ("large_cap") get
        # a materially higher ceiling than other clusters since they're meaningfully more
        # liquid and less prone to violent single-asset moves than an altcoin.
        #
        # The ceiling is derived from the SAME cascade-wick/maintenance-margin constants
        # the liquidation stress test below uses (with a safety margin), not set
        # independently -- an earlier version used flat 1.5x/1.0x/0.5x multiples of
        # self.max_leverage (e.g. 20x for mid_cap) that the stress test could never
        # actually pass: confirmed live, a real AVAXUSDT candidate computed at just 5.55x
        # leverage still failed with an 11.3% liquidation buffer against mid_cap's 12.0%
        # required cascade-wick buffer. Structurally, mid_cap leverage above ~7.7x can
        # never pass that check regardless of conviction, so a ceiling above that was
        # unusable headroom, not real capacity. If more real leverage capacity is wanted
        # later, loosen config.liquidation_buffer_stress_multiplier (currently 1.5) --
        # this formula will then automatically allow more, since it derives from the same
        # constants rather than a disconnected number.
        mm_rate = _MAINTENANCE_MARGIN_RATES.get(cluster, 0.01)
        cluster_cascade = _CLUSTER_CASCADE_SIZES.get(cluster, 0.08)
        stress_wick = cluster_cascade * config.liquidation_buffer_stress_multiplier
        max_passable_leverage = 1.0 / (stress_wick + mm_rate)
        stress_consistent_cap = max_passable_leverage * 0.85  # margin below exact breakeven

        if cluster == "large_cap":
            cluster_ceiling = min(self.max_leverage * 1.5, stress_consistent_cap)
            base_leverage = min(5.0, cluster_ceiling)
        elif cluster == "mid_cap":
            cluster_ceiling = min(self.max_leverage, stress_consistent_cap)
            base_leverage = min(3.0, cluster_ceiling)
        else:
            cluster_ceiling = min(self.max_leverage * 0.5, stress_consistent_cap)
            base_leverage = min(2.0, cluster_ceiling)

        if regime_transitioning or opportunity.regime_stability < 0.60:
            cluster_ceiling *= 0.70  # Portfolio-level regime leverage throttle
            base_leverage *= 0.70
        base_leverage = min(base_leverage, cluster_ceiling)

        conviction = max(0.0, min(1.0, (opportunity.p_win - 0.5) * 2.0))
        leverage = base_leverage + (cluster_ceiling - base_leverage) * conviction
        margin_required = notional_size / max(leverage, 1.0)

        # 4. Estimated Liquidation Price & Scenario Buffer Stress Check (§9)
        if opportunity.direction == TradeDirection.LONG:
            # P_liq = P_entry * (1 - 1/leverage + mm_rate)
            liq_price = max(0.01, entry_p * (1.0 - 1.0 / leverage + mm_rate))
            liq_buffer_pct = (entry_p - liq_price) / entry_p
            stop_buffer_pct = (entry_p - initial_stop) / entry_p
        else:
            # P_liq = P_entry * (1 + 1/leverage - mm_rate)
            liq_price = entry_p * (1.0 + 1.0 / leverage - mm_rate)
            liq_buffer_pct = (liq_price - entry_p) / entry_p
            stop_buffer_pct = (initial_stop - entry_p) / entry_p

        # Scenario stress: cascade shock must not breach liquidation price before stop.
        # cluster_cascade/stress_wick already computed above alongside the leverage
        # ceiling derivation -- reused here rather than recomputed.
        # Liquidation buffer must exceed both stop distance and the historical cascade wick
        passed_liq_check = (liq_buffer_pct > stop_buffer_pct * 1.25) and (liq_buffer_pct > stress_wick)
        if not passed_liq_check:
            rejection_reasons.append(
                f"Liquidation buffer ({liq_buffer_pct:.1%}) fails scenario stress test "
                f"against cascade wick ({stress_wick:.1%})"
            )

        return PositionSizingResult(
            notional_size=notional_size,
            leverage=leverage,
            margin_required=margin_required,
            initial_stop_price=initial_stop,
            liquidation_price=liq_price,
            liquidation_buffer_pct=liq_buffer_pct,
            passed_liquidation_stress_check=passed_liq_check,
            rejection_reasons=rejection_reasons,
        )

    def calculate_trailing_stop(
        self,
        position: Position,
        current_price: float,
        atr_value: float | None = None,
        dvol: float | None = None,
        dvol_baseline: float | None = None,
    ) -> float | None:
        """Computes updated ATR trailing stop price. See SCOPE.md §9."""
        atr = atr_value or (position.entry_price * 0.02)
        atr_mult = config.atr_stop_multiplier

        is_crypto_major = position.symbol.upper().startswith(("BTC", "ETH"))
        if is_crypto_major and dvol and dvol_baseline and dvol > dvol_baseline * 1.15:
            atr_mult *= config.dvol_widen_factor

        trail_dist = max(atr * atr_mult, position.entry_price * 0.015)
        activation_thresh = position.entry_price * config.atr_activation_pct

        if position.direction == TradeDirection.LONG:
            # Update high watermark
            highest = max(position.highest_price, current_price)
            position.highest_price = highest

            # Activation: only trail once price moves favorably by activation %
            if highest >= position.entry_price + activation_thresh:
                candidate_stop = highest - trail_dist
                # Trailing stop only moves up, never down
                current_stop = position.trailing_stop_price or position.stop_loss_price
                return max(current_stop, candidate_stop)
        else:
            # Short direction
            lowest = min(position.lowest_price or current_price, current_price)
            position.lowest_price = lowest

            if lowest <= position.entry_price - activation_thresh:
                candidate_stop = lowest + trail_dist
                # Trailing stop only moves down, never up
                current_stop = position.trailing_stop_price or position.stop_loss_price
                return min(current_stop, candidate_stop)

        return position.trailing_stop_price

    def check_factor_and_correlation_limits(
        self,
        opportunity: Opportunity,
        sizing: PositionSizingResult,
        portfolio: PortfolioState,
        cluster: str = "large_cap",
        candidate_beta: float = 1.0,
    ) -> tuple[bool, list[str]]:
        """Checks cluster correlation limits and total portfolio BTC beta exposure (§9)."""
        reasons: list[str] = []

        # 1. Cluster Exposure Cap
        existing_cluster_notional = sum(
            p.size_notional for p in portfolio.open_positions.values() if p.cluster == cluster
        )
        total_cluster_notional = existing_cluster_notional + sizing.notional_size
        cluster_exposure_pct = total_cluster_notional / max(portfolio.equity, 1.0)

        if cluster_exposure_pct > config.max_correlation_cluster_exposure:
            reasons.append(
                f"Cluster {cluster} exposure ({cluster_exposure_pct:.1%}) "
                f"exceeds cap ({config.max_correlation_cluster_exposure:.1%})"
            )

        # 2. Total Portfolio BTC Beta Exposure
        existing_beta_notional = sum(
            p.size_notional * p.beta_to_btc for p in portfolio.open_positions.values()
        )
        candidate_beta_notional = sizing.notional_size * candidate_beta
        total_beta_equiv = (existing_beta_notional + candidate_beta_notional) / max(
            portfolio.equity, 1.0
        )

        if total_beta_equiv > config.max_btc_beta_exposure:
            reasons.append(
                f"Total BTC beta exposure ({total_beta_equiv:.2f}x) "
                f"exceeds limit ({config.max_btc_beta_exposure:.2f}x)"
            )

        passed = len(reasons) == 0
        return passed, reasons

    def stress_test_portfolio(
        self,
        candidate_opp: Opportunity,
        candidate_sizing: PositionSizingResult,
        portfolio: PortfolioState,
        btc_shock_pct: float | None = None,
        candidate_beta: float = 1.0,
    ) -> StressTestResult:
        """Pre-trade portfolio scenario stress test.

        Simulates sharp BTC drop (e.g. -6% in 20 min) propagated via beta to held positions
        + candidate, and verifies aggregate margin ratio and equity survival (§9).
        """
        shock = btc_shock_pct or config.portfolio_stress_btc_shock_pct
        breach_reasons: list[str] = []

        # Simulate P&L on held positions
        simulated_loss = 0.0
        for pos in portfolio.open_positions.values():
            asset_shock = shock * pos.beta_to_btc
            # Directional impact
            if pos.direction == TradeDirection.LONG:
                pos_loss = pos.size_notional * asset_shock
            else:
                pos_loss = -pos.size_notional * asset_shock
            simulated_loss += pos_loss

        # Simulate candidate position
        cand_asset_shock = shock * candidate_beta
        if candidate_opp.direction == TradeDirection.LONG:
            cand_loss = candidate_sizing.notional_size * cand_asset_shock
        else:
            cand_loss = -candidate_sizing.notional_size * cand_asset_shock
        simulated_loss += cand_loss

        projected_equity = max(1.0, portfolio.equity + simulated_loss)
        total_margin = portfolio.margin_used + candidate_sizing.margin_required
        simulated_margin_ratio = total_margin / projected_equity

        if simulated_margin_ratio > 0.85:
            breach_reasons.append(
                f"Post-shock margin ratio reaches dangerous level ({simulated_margin_ratio:.1%} > 85%)"
            )
        if projected_equity < portfolio.equity * 0.70:
            loss_pct = abs(simulated_loss) / portfolio.equity
            breach_reasons.append(
                f"Simulated portfolio loss ({loss_pct:.1%}) exceeds 30% shock threshold"
            )

        passed = len(breach_reasons) == 0
        return StressTestResult(
            passed=passed,
            simulated_margin_ratio=simulated_margin_ratio,
            projected_equity=projected_equity,
            breach_reasons=breach_reasons,
        )
