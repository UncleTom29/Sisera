"""Position Intelligence models. See SCOPE.md §12.

Re-evaluates active positions against their original Opportunity trade thesis
and outputs HOLD, ADD, REDUCE, EXIT, TIGHTEN_STOP, or WIDEN_STOP.
"""

from __future__ import annotations

import time
from enum import StrEnum

from pydantic import BaseModel, Field


class PositionAction(StrEnum):
    HOLD = "HOLD"
    ADD = "ADD"
    REDUCE = "REDUCE"
    EXIT = "EXIT"
    TIGHTEN_STOP = "TIGHTEN_STOP"
    WIDEN_STOP = "WIDEN_STOP"


class PositionEvaluation(BaseModel):
    """Output of Position Intelligence Engine re-evaluating an open position."""

    symbol: str
    action: PositionAction
    reason_codes: list[str]
    rationale: str
    suggested_stop_price: float | None = None
    size_adjustment_factor: float = 1.0  # e.g. 0.5 for 50% reduce, 1.3 for 30% add
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
