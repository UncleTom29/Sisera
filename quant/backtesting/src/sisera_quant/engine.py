"""Event-driven backtesting engine (spec §25).

Replays bars through the canonical domain: signals -> OMS -> deterministic risk ->
paper execution -> portfolio -> ledger -> TCA. No lookahead: the strategy sees only bars
up to the current timestamp. All accounting is Decimal.
"""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Protocol

from pydantic import BaseModel, ConfigDict
from sisera_domain import (
    Asset,
    Money,
    OrderManager,
    OrderSide,
    OrderType,
    Portfolio,
    RiskEngine,
    RiskPolicy,
)
from sisera_domain.execution import PaperExecutionEngine


class Bar(BaseModel):
    model_config = ConfigDict(frozen=True)

    timestamp_ms: int
    instrument_id: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal = Decimal("0")


class Signal(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    direction: OrderSide
    confidence: Decimal = Decimal("0.5")
    timestamp_ms: int = 0


class Strategy(Protocol):
    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Signal | None: ...


class ClosedTrade(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    direction: OrderSide
    entry_price: Decimal
    exit_price: Decimal
    quantity: Decimal
    pnl: Decimal


class BacktestMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    bars: int
    trades: int
    total_return: Decimal
    max_drawdown: Decimal
    sharpe: Decimal
    profit_factor: Decimal
    win_rate: Decimal
    expectancy: Decimal
    turnover: Decimal
    final_equity: Decimal


class BacktestResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    metrics: BacktestMetrics
    equity_curve: tuple[Decimal, ...] = ()
    trades: tuple[ClosedTrade, ...] = ()


def _sharpe(returns: list[Decimal], periods_per_year: int = 8760) -> Decimal:
    if len(returns) < 2:
        return Decimal("0")
    n = len(returns)
    mean = sum(returns, Decimal("0")) / n
    var = sum(((r - mean) ** 2 for r in returns), Decimal("0")) / (n - 1)
    std = Decimal(str(math.sqrt(float(var)))) if var > 0 else Decimal("0")
    if std == 0:
        return Decimal("0")
    return (mean / std) * Decimal(str(math.sqrt(periods_per_year)))


class BacktestEngine:
    """Deterministic event-driven backtester over the canonical domain."""

    def __init__(
        self,
        initial_cash: Decimal = Decimal("100000"),
        quote_asset: Asset | str = "USDT",
        risk_policy: RiskPolicy | None = None,
        taker_fee_rate: Decimal = Decimal("0.0006"),
        maker_fee_rate: Decimal = Decimal("0.0002"),
        spread_bps: Decimal = Decimal("2"),
    ) -> None:
        self.initial_cash = initial_cash
        self.quote = Asset(quote_asset) if isinstance(quote_asset, str) else quote_asset
        self.risk = RiskEngine(risk_policy or RiskPolicy())
        self.paper = PaperExecutionEngine(
            taker_fee_rate=taker_fee_rate,
            maker_fee_rate=maker_fee_rate,
            spread_bps=spread_bps,
        )

    def run(self, bars: list[Bar], strategy: Strategy) -> BacktestResult:
        oms = OrderManager()
        portfolio = Portfolio(
            portfolio_id="bt",
            name="backtest",
            quote_asset=self.quote,
            cash={self.quote.code: Money(self.initial_cash, self.quote)},
            peak_equity=self.initial_cash,
        )
        equity_curve: list[Decimal] = []
        trades: list[ClosedTrade] = []
        turnover = Decimal("0")
        open_positions: dict[str, dict] = {}

        for bar in bars:
            signal = strategy.on_bar(bar, portfolio)
            if signal is not None and signal.instrument_id not in open_positions:
                order = oms.create_order(
                    client_order_id=f"bt_{bar.timestamp_ms}_{signal.instrument_id}",
                    instrument_id=signal.instrument_id,
                    side=signal.direction,
                    order_type=OrderType.MARKET,
                    quantity=Decimal("1"),
                    account_id="bt",
                    portfolio_id="bt",
                )
                check = self.risk.check_pre_trade(order, portfolio, mark_price=bar.close)
                if not check.approved:
                    continue
                filled = self.paper.submit(order, mid_price=bar.close)
                if filled.filled_quantity <= 0:
                    continue
                notional = filled.filled_quantity * filled.avg_fill_price
                turnover += notional
                open_positions[signal.instrument_id] = {
                    "direction": signal.direction,
                    "entry": filled.avg_fill_price,
                    "qty": filled.filled_quantity,
                }

            # Mark-to-market and close on opposite signal (simple reversal exit for the harness).
            equity = portfolio.cash_in(self.quote).amount
            for iid, pos in list(open_positions.items()):
                is_reversal = (
                    iid == bar.instrument_id
                    and signal is not None
                    and signal.direction != pos["direction"]
                )
                if is_reversal:
                    exit_price = bar.close
                    qty = pos["qty"]
                    if pos["direction"] == OrderSide.BUY:
                        pnl = (exit_price - pos["entry"]) * qty
                    else:
                        pnl = (pos["entry"] - exit_price) * qty
                    trades.append(
                        ClosedTrade(
                            instrument_id=iid,
                            direction=pos["direction"],
                            entry_price=pos["entry"],
                            exit_price=exit_price,
                            quantity=qty,
                            pnl=pnl,
                        )
                    )
                    equity += pnl
                    del open_positions[iid]
                else:
                    # Unrealized: mark open positions at this bar if it matches.
                    if iid == bar.instrument_id:
                        if pos["direction"] == OrderSide.BUY:
                            equity += (bar.close - pos["entry"]) * pos["qty"]
                        else:
                            equity += (pos["entry"] - bar.close) * pos["qty"]
            equity_curve.append(equity)

        final_equity = equity_curve[-1] if equity_curve else self.initial_cash
        total_return = (final_equity - self.initial_cash) / self.initial_cash

        peak = self.initial_cash
        max_dd = Decimal("0")
        for eq in equity_curve:
            peak = max(peak, eq)
            dd = (peak - eq) / peak if peak > 0 else Decimal("0")
            max_dd = max(max_dd, dd)

        rets: list[Decimal] = []
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i - 1]
            rets.append((equity_curve[i] - prev) / prev if prev > 0 else Decimal("0"))

        wins = [t.pnl for t in trades if t.pnl > 0]
        losses = [abs(t.pnl) for t in trades if t.pnl <= 0]
        gross_win = sum(wins, Decimal("0"))
        gross_loss = sum(losses, Decimal("0"))
        profit_factor = (gross_win / gross_loss) if gross_loss > 0 else Decimal("0")
        win_rate = Decimal(len(wins)) / len(trades) if trades else Decimal("0")
        expectancy = sum((t.pnl for t in trades), Decimal("0")) / len(trades) if trades else Decimal("0")

        return BacktestResult(
            metrics=BacktestMetrics(
                bars=len(bars),
                trades=len(trades),
                total_return=total_return,
                max_drawdown=max_dd,
                sharpe=_sharpe(rets),
                profit_factor=profit_factor,
                win_rate=win_rate,
                expectancy=expectancy,
                turnover=turnover,
                final_equity=final_equity,
            ),
            equity_curve=tuple(equity_curve),
            trades=tuple(trades),
        )


def walk_forward(
    bars: list[Bar],
    strategy_factory,
    n_splits: int = 3,
    engine_factory=None,
) -> list[BacktestResult]:
    """Split bars into `n_splits` chronological folds; train on all but the last fold's
    prefix is the caller's responsibility — this harness runs each fold's test window.
    Here each fold tests on an equal trailing slice (simple, no lookahead)."""
    if n_splits < 1 or not bars:
        return []
    fold = max(1, len(bars) // (n_splits + 1))
    results: list[BacktestResult] = []
    for i in range(n_splits):
        start = len(bars) - fold * (n_splits - i)
        end = len(bars) - fold * (n_splits - i - 1)
        window = bars[max(0, start):end]
        if not window:
            continue
        engine = engine_factory() if engine_factory else BacktestEngine()
        strategy = strategy_factory()
        results.append(engine.run(window, strategy))
    return results
