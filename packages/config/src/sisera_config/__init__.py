"""Sisera configuration layer.

Implements the config foundation from the product spec §55/§53/§35: a typed, validated,
environment-driven settings object with an explicit **live-trading safety gate**. Live
trading is disabled by default and must be enabled through multiple explicit steps; test
environments must never accidentally submit live orders.
"""

from sisera_config.live_trading import LiveTradingDisabled, LiveTradingGuard
from sisera_config.settings import Environment, Settings, get_settings

__all__ = [
    "Environment",
    "Settings",
    "get_settings",
    "LiveTradingDisabled",
    "LiveTradingGuard",
]
