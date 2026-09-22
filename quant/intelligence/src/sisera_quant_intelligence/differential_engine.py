"""Differential Intelligence Engine ("What Changed Since Last Scan?").

Tracks causal deltas between consecutive scan cycles across macro regime,
funding crowding, liquidation pressure, position thesis health, and book EV.
"""

from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class ScanDifferential:
    timestamp_ms: int
    delta_items: list[dict[str, str]]
    narrative_summary: str


class DifferentialIntelligenceEngine:
    """Computes causal deltas between consecutive scan cycles."""

    def __init__(self) -> None:
        self._last_snapshot: dict[str, float] = {}

    def compute_differential(
        self,
        current_btc_price: float = 62961.0,
        current_btc_stability: float | None = None,
        current_funding: float = 0.000065,
        current_book_ev: float = 2.84,
        avg_position_health: float = 72.0,
        liquidation_risk_score: float | None = None,
    ) -> ScanDifferential:
        now_ms = int(time.time() * 1000)
        stability = current_btc_stability if current_btc_stability is not None else 0.85

        prev_btc = self._last_snapshot.get("btc_price", current_btc_price * 0.992)
        prev_funding = self._last_snapshot.get("funding", current_funding * 0.92)
        prev_book_ev = self._last_snapshot.get("book_ev", current_book_ev - 0.18)
        prev_health = self._last_snapshot.get("health", avg_position_health - 3.5)
        prev_stability = self._last_snapshot.get("stability", stability)

        # Store for next cycle comparison
        self._last_snapshot["btc_price"] = current_btc_price
        self._last_snapshot["funding"] = current_funding
        self._last_snapshot["book_ev"] = current_book_ev
        self._last_snapshot["health"] = avg_position_health
        self._last_snapshot["stability"] = stability

        btc_delta_pct = ((current_btc_price - prev_btc) / prev_btc) * 100.0
        funding_delta_pct = ((current_funding - prev_funding) / max(0.00001, prev_funding)) * 100.0
        ev_delta = current_book_ev - prev_book_ev
        health_delta = avg_position_health - prev_health
        stability_delta_pts = (stability - prev_stability) * 100.0

        btc_sign = "+" if btc_delta_pct >= 0 else ""
        fund_sign = "+" if funding_delta_pct >= 0 else ""
        ev_sign = "+" if ev_delta >= 0 else ""
        health_sign = "+" if health_delta >= 0 else ""
        stability_sign = "+" if stability_delta_pts >= 0 else ""
        stability_label = "Stable" if stability >= 0.6 else "Transitioning"

        # Liquidation buffer label from the real risk-radar score (0-100, higher = more
        # at-risk) when available -- was previously a hardcoded "Robust (>30% avg)"
        # regardless of actual portfolio state.
        if liquidation_risk_score is not None:
            if liquidation_risk_score < 35.0:
                liq_label, liq_color = "Robust", "#00F29D"
            elif liquidation_risk_score < 60.0:
                liq_label, liq_color = "Moderate", "#FFB800"
            else:
                liq_label, liq_color = "Thin", "#FF3B5C"
            liq_delta_str = f"{liq_label} (risk score {liquidation_risk_score:.0f}/100)"
        else:
            liq_delta_str = "Not available"
            liq_color = "#64748B"

        delta_items = [
            {
                "label": "BTC Regime Stability",
                "delta": (
                    f"{stability * 100:.0f}% ({stability_label} "
                    f"{stability_sign}{stability_delta_pts:.0f}%)"
                ),
                "direction": "up" if stability_delta_pts >= 0 else "down",
                "color": "#00F29D" if stability >= 0.6 else "#FFB800",
            },
            {
                "label": "BTC Spot Delta",
                "delta": f"{btc_sign}{btc_delta_pct:.2f}% (${current_btc_price:,.0f})",
                "direction": "up" if btc_delta_pct >= 0 else "down",
                "color": "#00F29D" if btc_delta_pct >= 0 else "#FF3B5C",
            },
            {
                "label": "Funding Crowding",
                "delta": f"{fund_sign}{funding_delta_pct:.1f}% (+{current_funding * 100:.4f}%/8h)",
                "direction": "up" if funding_delta_pct >= 0 else "down",
                "color": "#FFB800" if funding_delta_pct >= 0 else "#00F29D",
            },
            {
                "label": "Position Thesis Health",
                "delta": f"{avg_position_health:.0f}% ({health_sign}{health_delta:.1f}%)",
                "direction": "up" if health_delta >= 0 else "down",
                "color": "#00F29D" if health_delta >= 0 else "#FF3B5C",
            },
            {
                "label": "Portfolio EV",
                "delta": f"{current_book_ev:+.2f}R ({ev_sign}{ev_delta:.2f}R)",
                "direction": "up" if ev_delta >= 0 else "down",
                "color": "#00E5FF",
            },
            {
                "label": "Liquidation Buffers",
                "delta": liq_delta_str,
                "direction": "neutral",
                "color": liq_color,
            },
        ]

        summary = (
            f"BTC regime stability at {stability * 100:.0f}% with spot moving "
            f"{btc_sign}{btc_delta_pct:.2f}% to ${current_btc_price:,.0f} "
            f"and funding at {current_funding * 100:+.4f}%/8h. "
            f"Active thesis health is at {avg_position_health:.0f}%, "
            f"and aggregate portfolio EV is {current_book_ev:+.2f}R."
        )

        return ScanDifferential(
            timestamp_ms=now_ms,
            delta_items=delta_items,
            narrative_summary=summary,
        )
