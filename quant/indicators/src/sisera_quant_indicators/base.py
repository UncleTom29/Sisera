from __future__ import annotations

from typing import Protocol

import pandas as pd
from pydantic import BaseModel


class IndicatorResult(BaseModel):
    """Common output shape every indicator normalizes to. See SCOPE.md §2, §5."""

    name: str
    score: float  # -1..1. Directional indicators: bearish..bullish. Volatility/volume
    #                indicators: "how elevated vs. its own recent baseline" — still
    #                bounded and meaningful, just not a buy/sell direction.
    value: float  # raw underlying value (e.g. RSI=72.3, ATR=145.2) — downstream
    #               consumers like stop-distance sizing (§9) use this, not the score.
    reliability: float = 1.0  # §5 — down-weight thinly-computed indicators


class Indicator(Protocol):
    name: str
    min_periods: int  # minimum bars of history required to compute meaningfully

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult: ...
