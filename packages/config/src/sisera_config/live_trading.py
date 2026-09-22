"""Live-trading safety guard (§53).

Production code must refuse live order submission unless live mode is explicitly enabled.
This is a hard gate, not a warning: the guard raises `LiveTradingDisabled` by default so a
test environment or a misconfiguration can never silently place a live order.
"""

from __future__ import annotations

from sisera_config.settings import Environment, Settings, get_settings


class LiveTradingDisabled(RuntimeError):
    """Raised when a live order is attempted while live trading is disabled."""


class LiveTradingGuard:
    """Deterministic gate between the OMS and a live venue adapter."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def live_enabled(self) -> bool:
        s = self._settings
        return s.environment == Environment.PROD and s.live_trading_enabled

    def assert_live_allowed(self) -> None:
        """Raise unless live trading is explicitly enabled in a prod environment.

        Rationale: `SISERA_LIVE_TRADING_ENABLED=false` (default) must refuse live order
        submission, and even `live_trading_enabled=true` must not fire in a non-prod
        environment (e.g. a shared test/staging deployment).
        """
        if not self.live_enabled:
            raise LiveTradingDisabled(
                "Live order submission is disabled. Set SISERA_ENVIRONMENT=prod and "
                "SISERA_LIVE_TRADING_ENABLED=true to enable it. Test/paper orders are "
                "always allowed."
            )

    def is_paper_or_testnet(self) -> bool:
        """True when execution is paper or testnet (i.e. safe to submit)."""
        return not self.live_enabled
