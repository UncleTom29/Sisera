"""Backtesting models. See SCOPE.md §10.

Captures comprehensive backtesting metrics: Expected Value, Profit Factor, Max Drawdown,
Tail Loss (CVaR), Deflated Sharpe Ratio, and diagnostic Win Rate per timeframe.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from sisera.backtest.attribution import TradeAttribution, WhyNotAttribution


class BacktestTimeframeResult(BaseModel):
    """Independent backtest evaluation for one timeframe profile. See SCOPE.md §10."""

    timeframe: str
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float  # Diagnostic only (§1, §7)
    expected_value: float  # Gating metric
    profit_factor: float  # Gating metric
    max_drawdown: float  # Gating metric
    tail_loss_cvar: float  # Gating metric (CVaR at 95%)
    deflated_sharpe_ratio: float  # Gating metric
    sharpe_ratio: float
    total_return_pct: float
    equity_curve: list[float]
    passed_gating: bool
    gating_rejection_reasons: list[str] = Field(default_factory=list)
    indicator_marginal_contributions: dict[str, float] = Field(default_factory=dict)
    trade_attributions: list[TradeAttribution] = Field(default_factory=list)


class FullBacktestReport(BaseModel):
    """Aggregated multi-timeframe backtesting report."""

    timeframe_results: dict[str, BacktestTimeframeResult]
    portfolio_equity_curve: list[float]
    why_not_attribution: WhyNotAttribution | None = None
    overall_deflated_sharpe: float
    live_approved_timeframes: list[str]


class CPCVResult(BaseModel):
    """Combinatorial Purged Cross-Validation report. See SCOPE.md §7, §10.

    A single train/test split can pass gating by luck -- CPCV instead evaluates every
    combination of `test_group_size` blocks out of `n_groups` contiguous time blocks as a
    separate held-out fold (purging any training example whose forward-return label window
    overlaps a test block, plus an embargo after each test block), and reports the *spread*
    of out-of-sample results across folds rather than trusting any one split. A strategy
    that only clears gating on some folds is a strategy that got lucky on a single split,
    not one with a validated edge.

    This is a purged, embargoed, combinatorial K-fold CV -- it captures CPCV's core
    anti-leakage and multiple-comparisons discipline, but it is not López de Prado's exact
    path-reconstruction algorithm (which reassembles the C(n_groups, test_group_size) folds
    into `n_groups!/((n_groups-test_group_size)!*test_group_size!) * test_group_size/n_groups`
    full-length backtest paths). Treat `fold_results` as `n_folds` independent-ish held-out
    estimates, not as that many literal alternate-history backtest paths.
    """

    symbol: str
    timeframe: str
    n_groups: int
    test_group_size: int
    n_folds: int
    embargo_bars: int
    fold_results: list[BacktestTimeframeResult]
    folds_passed_gating: int
    fold_pass_rate: float
    pooled_result: BacktestTimeframeResult  # all folds' out-of-sample trades pooled together
    dsr_by_fold: list[float]
    ev_by_fold: list[float]
