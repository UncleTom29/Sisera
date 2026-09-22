"""Risk-monitor worker.

Periodically evaluates portfolio risk (leverage, drawdown, concentration), trips kill
switches on breach, and emits notifications. Dependencies (portfolio source, price feed,
circuit breaker, notifier) are injected so the job is deterministic and testable.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from sisera_domain import (
    Category,
    Channel,
    CircuitBreaker,
    EmergencyMode,
    KillScope,
    Notification,
    NotificationService,
    Portfolio,
    Severity,
)


class PriceFeed(Protocol):
    def mark_price(self, instrument_id: str) -> Decimal | None: ...


class RiskMonitor:
    def __init__(
        self,
        *,
        max_leverage: Decimal = Decimal("10"),
        max_drawdown: Decimal = Decimal("0.15"),
        max_concentration: Decimal = Decimal("0.4"),
        circuit: CircuitBreaker | None = None,
        notifications: NotificationService | None = None,
    ) -> None:
        self.max_leverage = max_leverage
        self.max_drawdown = max_drawdown
        self.max_concentration = max_concentration
        self.circuit = circuit or CircuitBreaker()
        self.notifications = notifications or NotificationService()

    def check(
        self, portfolio: Portfolio, prices: PriceFeed, scope_id: str = "global"
    ) -> list[str]:
        """Evaluate one portfolio. Returns breach descriptions; trips kill switches and
        notifies on breach."""
        breaches: list[str] = []

        # Refresh marks from the price feed.
        marked_positions = {}
        for iid, pos in portfolio.positions.items():
            mark = prices.mark_price(iid)
            if mark is not None:
                marked_positions[iid] = pos.model_copy(update={"mark_price": mark})
            else:
                marked_positions[iid] = pos
        portfolio = portfolio.model_copy(update={"positions": marked_positions})

        if portfolio.leverage > self.max_leverage:
            breaches.append(f"leverage {portfolio.leverage:.2f} > {self.max_leverage}")
        if portfolio.current_drawdown > self.max_drawdown:
            breaches.append(f"drawdown {portfolio.current_drawdown:.2%} > {self.max_drawdown:.0%}")
        if portfolio.concentration > self.max_concentration:
            breaches.append(
                f"concentration {portfolio.concentration:.2%} > {self.max_concentration:.0%}"
            )

        for breach in breaches:
            self.circuit.trip(
                KillScope.PORTFOLIO,
                portfolio.portfolio_id,
                EmergencyMode.BLOCK_NEW_ORDERS,
                breach,
                by="risk-monitor",
            )
            self.notifications.notify(
                Notification(
                    notification_id=f"risk_{portfolio.portfolio_id}_{len(breaches)}",
                    category=Category.RISK,
                    severity=Severity.CRITICAL,
                    title=f"Risk breach: {portfolio.portfolio_id}",
                    body=breach,
                    channels=(Channel.IN_APP,),
                    dedup_key=f"risk_{portfolio.portfolio_id}_{breach.split()[0]}",
                )
            )
        _ = scope_id
        return breaches
