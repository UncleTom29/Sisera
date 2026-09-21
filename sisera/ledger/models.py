"""Decision Ledger models. See SCOPE.md §1, §8.

Immutable decision provenance records containing model versions, strategy profile versions,
risk policy versions, reason codes, full Opportunity trade theses, plain-language rationales,
and counterfactual decision quality verdicts.
"""

from __future__ import annotations

import time
from typing import Any

from pydantic import BaseModel, Field


class DecisionLedgerEntry(BaseModel):
    """An immutable record of a trading decision. Shared between backtesting and live execution."""

    entry_id: str
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    symbol: str
    timeframe: str
    decision: str  # "TRADE" | "WAIT" | "NO_TRADE"
    model_version: str = "1.0.0"
    strategy_profile_version: str = "1.0.0"
    risk_policy_version: str = "1.0.0"
    execution_policy_version: str = "1.0.0"
    reason_codes: list[str] = Field(default_factory=list)
    opportunity_snapshot: dict[str, Any] = Field(default_factory=dict)
    plain_language_rationale: str = ""
    counterfactual_return_4h: float | None = None
    counterfactual_return_24h: float | None = None
    counterfactual_verdict: str | None = None  # "CORRECT_ABSTENTION", "MISSED_OPPORTUNITY", "PROFITABLE_TRADE"
