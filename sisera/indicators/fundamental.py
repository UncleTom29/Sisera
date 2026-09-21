"""Fundamental / on-chain family. See SCOPE.md §5 — explicitly "the thinnest
free-data coverage" family in the whole doc (§3). What's implemented here is what's
genuinely free and verifiable without a paid API key:

- Market-cap tier, mcap/volume ratio, supply dilution: from CoinGecko/CoinPaprika
  data already flowing through the Universe Manager (§4) — no new integration.
- On-chain activity trend: Blockchair's free, keyless `/ethereum/stats` endpoint
  gives a current tx-count snapshot; a *trend* needs cached snapshots over time,
  which is an orchestrator concern (not built yet), not something to fake here.

Explicitly NOT implemented, and not silently stubbed as if it were — per research
this session: active-address trend has no free source anywhere (Etherscan doesn't
even have a paid endpoint for it; Blockchair returns an unpopulated 0 for Ethereum
addresses). Whale/exchange flow data is not available free anywhere either
(Glassnode/Whale Alert/Etherscan address-labeling are all paid-tier-gated). This
matches §5's own "where available" hedge for both.
"""

from __future__ import annotations

import math

import pandas as pd

from sisera.data.models import CoinMarketData
from sisera.indicators.base import IndicatorResult


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


def compute_market_cap_tier(market_data: CoinMarketData) -> IndicatorResult:
    """Market-cap tier as a liquidity/risk-tier proxy (§5). Magnitude-only, not
    directional — being large-cap isn't bullish or bearish, it's a risk-profile
    read that feeds §7's risk score, not its confidence score. Log-scaled since
    market cap itself is heavily log-distributed (rank 1 vs. 2 differs far more
    in absolute terms than rank 199 vs. 200)."""
    if not market_data.market_cap_rank or market_data.market_cap_rank < 1:
        return IndicatorResult(name="market_cap_tier", score=0.0, value=0.0)
    tier_score = 1.0 - math.log10(market_data.market_cap_rank) / math.log10(200)
    return IndicatorResult(
        name="market_cap_tier", score=_clip(tier_score), value=float(market_data.market_cap_rank)
    )


def compute_mcap_volume_ratio(market_data: CoinMarketData) -> IndicatorResult:
    """Liquidity proxy (§5) — now secondary to real order-book depth (§3) for risk
    scoring, but still a cheap sanity signal. Magnitude-only: a high ratio means
    thin turnover relative to size, a risk flag rather than a direction. The scale
    constant is a rough placeholder, not a calibrated threshold — real calibration
    is a backtesting job (§10), not something to assert confidently here.
    """
    if not market_data.total_volume or market_data.total_volume <= 0 or not market_data.market_cap:
        return IndicatorResult(name="mcap_volume_ratio", score=0.0, value=0.0)
    ratio = market_data.market_cap / market_data.total_volume
    score = _clip(math.tanh((ratio - 20) / 50))
    return IndicatorResult(name="mcap_volume_ratio", score=score, value=ratio)


def compute_supply_dilution_risk(market_data: CoinMarketData) -> IndicatorResult:
    """Circulating vs. max supply (§5) — dilution/overhang risk. Naturally bounded
    0..1: 0 = fully circulating (no dilution risk left), 1 = almost nothing
    circulating yet relative to the eventual cap. `None` when the coin has no
    fixed max supply (common — not an error, just not applicable)."""
    if not market_data.max_supply or market_data.max_supply <= 0 or not market_data.circulating_supply:
        return IndicatorResult(name="supply_dilution_risk", score=0.0, value=0.0)
    circulating_pct = market_data.circulating_supply / market_data.max_supply
    dilution_remaining = _clip(1.0 - circulating_pct)
    return IndicatorResult(name="supply_dilution_risk", score=dilution_remaining, value=circulating_pct)


def compute_onchain_activity_trend(
    tx_count_history: pd.Series, baseline_window: int = 14
) -> IndicatorResult:
    """Transaction count trend (§5): "activity spikes often precede price moves."
    Magnitude-only, not directional — a spike can precede a move either way, same
    honest treatment as the liquidation-cascade indicator (§5). Needs a *history*
    of tx-count snapshots (via `BlockchairClient`, cached over time by whatever
    orchestrator ends up scheduling scans) — a single snapshot has no baseline to
    compare against.
    """
    if len(tx_count_history) < 2:
        return IndicatorResult(name="onchain_activity_trend", score=0.0, value=0.0)
    current = tx_count_history.iloc[-1]
    baseline = tx_count_history.tail(baseline_window).mean()
    if baseline <= 0:
        return IndicatorResult(name="onchain_activity_trend", score=0.0, value=float(current))
    score = _clip(abs(math.tanh((current - baseline) / baseline)))
    return IndicatorResult(name="onchain_activity_trend", score=score, value=float(current))
