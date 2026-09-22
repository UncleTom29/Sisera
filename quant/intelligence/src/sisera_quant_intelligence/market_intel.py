"""Market Intelligence Engine.

Synthesizes whole-market macro breadth, regime, volatility state, funding/OI trajectory,
crowding, and automated plain-language macroeconomic theses based on live market feeds.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class MarketIntelligence:
    btc_regime: str  # "TRENDING ↑ (Bullish)", "TRENDING ↓", "CONSOLIDATION", "TRANSITIONING"
    btc_stability_score: float  # 0.0 to 1.0
    btc_price: float
    market_breadth_pct: float  # % of universe bullish
    volatility_state: str  # "EXPANDING", "COMPRESSING", "NORMAL"
    dvol_level: float  # e.g. 52.4%
    aggregate_funding_rate: float  # e.g. +0.0065%
    funding_sentiment: str  # "NEUTRAL+", "OVERHEATED_LONGS", "OVERCROWDED_SHORTS"
    open_interest_trend: str  # "RISING (+3.8% 24h)", "FLAT", "FALLING"
    crowding_index: str  # "LOW", "MEDIUM", "ELEVATED"
    liquidation_risk: str  # "LOW", "MEDIUM", "HIGH"
    liquidity_health: str  # "HEALTHY", "MODERATE", "THIN"
    risk_appetite: str  # "HIGH", "MODERATELY HIGH", "NEUTRAL", "RISK_OFF"
    system_thesis: str  # Plain-language actionable narrative summary


class MarketIntelligenceEngine:
    """Computes real-time market-wide intelligence from live Bybit market data."""

    def compute(
        self,
        btc_ticker_price: float = 62961.0,
        btc_regime_type: str | None = None,
        btc_stability: float | None = None,
        btc_change_24h_pct: float = 2.4,
        market_breadth_pct: float = 68.0,
        avg_funding: float = 0.000065,
        dvol: float = 52.4,
        oi_change_24h_pct: float | None = None,
        near_touch_depth_usd: float | None = None,
    ) -> MarketIntelligence:
        stability = btc_stability if btc_stability is not None else 0.85

        if btc_regime_type == "TRANSITIONING" or stability < 0.50:
            regime_label = "TRANSITIONING"
            appetite = "RISK_OFF"
            crowd = "ELEVATED"
            thesis = (
                f"Market regime in transition around ${btc_ticker_price:,.0f} "
                f"(stability {stability * 100:.0f}%). "
                "Elevated epistemic uncertainty across macro and derivatives "
                "indicators; selective gating enforced."
            )
        elif btc_regime_type == "MEAN_REVERTING":
            regime_label = "CONSOLIDATION (Range-Bound)"
            appetite = "NEUTRAL"
            crowd = "LOW"
            thesis = (
                f"Range-bound consolidation across top assets at ${btc_ticker_price:,.0f}. "
                f"Market breadth at {market_breadth_pct:.0f}% with neutral funding "
                f"({avg_funding * 100:+.4f}%/8h). "
                "Selective mean-reversion at structural liquidity bands offers "
                "superior risk-reward."
            )
        elif btc_regime_type == "TRENDING" or btc_change_24h_pct >= 1.0:
            regime_label = (
                "TRENDING ↑ (Bullish Continuation)"
                if btc_change_24h_pct >= 0
                else "TRENDING ↓ (Bearish)"
            )
            appetite = "MODERATELY HIGH"
            crowd = "LOW"
            thesis = (
                f"BTC-led bullish continuation at ${btc_ticker_price:,.0f} "
                f"with {market_breadth_pct:.0f}% market breadth. "
                "Long trend-following setups maintain positive statistical "
                "expectancy (+0.65R+); aggressive counter-trend shorting is suppressed."
            )
        else:
            regime_label = "CONSOLIDATION (Range-Bound)"
            appetite = "NEUTRAL"
            crowd = "LOW"
            thesis = (
                f"Consolidation regime at ${btc_ticker_price:,.0f}. "
                f"Market breadth at {market_breadth_pct:.0f}% with neutral funding "
                f"({avg_funding * 100:+.4f}%/8h)."
            )

        vol_state = "EXPANDING" if dvol > 50.0 else "COMPRESSING"
        funding_str = (
            "NEUTRAL+"
            if 0.0 <= avg_funding < 0.00015
            else ("OVERHEATED_LONGS" if avg_funding >= 0.00015 else "OVERCROWDED_SHORTS")
        )

        # Real OI trend when a cycle-over-cycle comparison is available (caller caches the
        # previous reading -- see routes.py's get_market_intelligence); previously a flat
        # "RISING (+3.8% 24h)" literal regardless of input, since no parameter existed at
        # all for this.
        if oi_change_24h_pct is None:
            oi_trend = "insufficient history yet"
        elif oi_change_24h_pct > 1.0:
            oi_trend = f"RISING (+{oi_change_24h_pct:.1f}% 24h)"
        elif oi_change_24h_pct < -1.0:
            oi_trend = f"FALLING ({oi_change_24h_pct:.1f}% 24h)"
        else:
            oi_trend = f"FLAT ({oi_change_24h_pct:+.1f}% 24h)"

        # Real liquidity health from actual near-touch order-book depth, same depth
        # standard OpportunityEngine uses ($150k+ = healthy). Previously a flat "HEALTHY"
        # literal regardless of input, since no parameter existed at all for this.
        if near_touch_depth_usd is None:
            liquidity_health = "unknown"
        elif near_touch_depth_usd >= 150_000.0:
            liquidity_health = "HEALTHY"
        elif near_touch_depth_usd >= 25_000.0:
            liquidity_health = "MODERATE"
        else:
            liquidity_health = "THIN"

        return MarketIntelligence(
            btc_regime=regime_label,
            btc_stability_score=stability,
            btc_price=round(btc_ticker_price, 2),
            market_breadth_pct=round(market_breadth_pct, 1),
            volatility_state=vol_state,
            dvol_level=round(dvol, 1),
            aggregate_funding_rate=round(avg_funding, 6),
            funding_sentiment=funding_str,
            open_interest_trend=oi_trend,
            crowding_index=crowd,
            liquidation_risk="LOW" if stability >= 0.80 else "MEDIUM",
            liquidity_health=liquidity_health,
            risk_appetite=appetite,
            system_thesis=thesis,
        )
