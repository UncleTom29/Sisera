"""Circuit breakers and kill switches (spec §37).

Hierarchical emergency controls at global/org/desk/portfolio/account/strategy/agent/
instrument/venue levels. Emergency modes block new orders, cancel resting orders, enforce
reduce-only, close positions, or disable the agent runtime. All actions are auditable.
"""

from __future__ import annotations

import time
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class KillScope(StrEnum):
    GLOBAL = "GLOBAL"
    ORGANIZATION = "ORGANIZATION"
    DESK = "DESK"
    PORTFOLIO = "PORTFOLIO"
    ACCOUNT = "ACCOUNT"
    STRATEGY = "STRATEGY"
    AGENT = "AGENT"
    INSTRUMENT = "INSTRUMENT"
    VENUE = "VENUE"


class EmergencyMode(StrEnum):
    BLOCK_NEW_ORDERS = "BLOCK_NEW_ORDERS"
    CANCEL_RESTING = "CANCEL_RESTING"
    REDUCE_ONLY = "REDUCE_ONLY"
    CLOSE_POSITIONS = "CLOSE_POSITIONS"
    DISABLE_AGENT = "DISABLE_AGENT"


class KillSwitch(BaseModel):
    model_config = ConfigDict(frozen=True)

    scope: KillScope
    scope_id: str
    active: bool = False
    mode: EmergencyMode | None = None
    reason: str | None = None
    triggered_at_ms: int | None = None
    triggered_by: str | None = None
    cleared_at_ms: int | None = None
    cleared_by: str | None = None


class CircuitBreaker:
    """Hierarchical kill switches. A global trip blocks everything; narrower scopes block
    themselves. Scope-containment mapping (which org/desk/portfolio contains which
    account/strategy) lives in the service layer."""

    def __init__(self) -> None:
        self._switches: dict[tuple[KillScope, str], KillSwitch] = {}

    def trip(
        self, scope: KillScope, scope_id: str, mode: EmergencyMode, reason: str, by: str
    ) -> KillSwitch:
        switch = KillSwitch(
            scope=scope,
            scope_id=scope_id,
            active=True,
            mode=mode,
            reason=reason,
            triggered_at_ms=int(time.time() * 1000),
            triggered_by=by,
        )
        self._switches[(scope, scope_id)] = switch
        return switch

    def clear(self, scope: KillScope, scope_id: str, by: str) -> KillSwitch | None:
        key = (scope, scope_id)
        current = self._switches.get(key)
        if current is None or not current.active:
            return None
        cleared = current.model_copy(
            update={
                "active": False,
                "cleared_at_ms": int(time.time() * 1000),
                "cleared_by": by,
            }
        )
        self._switches[key] = cleared
        return cleared

    def is_blocked(self, scope: KillScope, scope_id: str) -> bool:
        # A scope is blocked if it, or any broader scope that contains it (global always
        # applies), has an active switch. For simplicity, global blocks everything; other
        # scopes block only themselves here (hierarchy mapping lives in the service layer).
        if scope == KillScope.GLOBAL:
            key = (KillScope.GLOBAL, scope_id)
            switch = self._switches.get(key)
            return switch is not None and switch.active
        global_switch = self._switches.get((KillScope.GLOBAL, "global"))
        if global_switch is not None and global_switch.active:
            return True
        switch = self._switches.get((scope, scope_id))
        return switch is not None and switch.active

    def active_switches(self) -> list[KillSwitch]:
        return [s for s in self._switches.values() if s.active]
