"""Scoring Engine. See SCOPE.md §7.

Calculates independent Confidence, Risk, Expected Value in R-multiples, Epistemic Uncertainty,
and preserves the full Indicator Family breakdown with cross-category disagreement penalties.
"""

from __future__ import annotations

import math
import zlib

import numpy as np

from sisera.data.models import CoinMarketData, OrderBook, Ticker, UniversePair
from sisera_quant_indicators.base import IndicatorResult
from sisera_quant_indicators.composite import StabilityState
from sisera_quant_indicators.engine import EngineOutput
from sisera_quant_scoring.calibration import (
    ConformalPredictor,
    IsotonicCalibrator,
)
from sisera_quant_scoring.models import (
    FamilyScore,
    IndicatorFamily,
    IndicatorFamilyScores,
    PairScore,
)
from sisera_quant_scoring.profiles import TimeframeStrategyProfile, default_timeframe_profiles

_FAMILY_MAPPING = {
    "ema_crossover": IndicatorFamily.TECHNICAL,
    "rsi": IndicatorFamily.TECHNICAL,
    "macd": IndicatorFamily.TECHNICAL,
    "atr": IndicatorFamily.TECHNICAL,
    "bollinger_band_width": IndicatorFamily.TECHNICAL,
    "obv": IndicatorFamily.TECHNICAL,
    "funding_rate": IndicatorFamily.DERIVATIVES,
    "long_short_ratio": IndicatorFamily.DERIVATIVES,
    "basis": IndicatorFamily.DERIVATIVES,
    "mark_index_divergence": IndicatorFamily.DERIVATIVES,
    "order_book_imbalance": IndicatorFamily.DERIVATIVES,
    "open_interest_trend": IndicatorFamily.DERIVATIVES,
    "cross_venue_funding_divergence": IndicatorFamily.DERIVATIVES,
    "liquidation_cascade": IndicatorFamily.DERIVATIVES,
    "implied_volatility": IndicatorFamily.OPTIONS,
    "put_call_skew": IndicatorFamily.OPTIONS,
    "market_cap_tier": IndicatorFamily.FUNDAMENTAL,
    "mcap_volume_ratio": IndicatorFamily.FUNDAMENTAL,
    "supply_dilution_risk": IndicatorFamily.FUNDAMENTAL,
    "onchain_activity_trend": IndicatorFamily.FUNDAMENTAL,
    "llm_fundamental_analysis": IndicatorFamily.FUNDAMENTAL,
    "news_sentiment": IndicatorFamily.FUNDAMENTAL,
    "macro_regime": IndicatorFamily.FUNDAMENTAL,
    "smart_money_divergence": IndicatorFamily.COMPOSITE,
    "liquidity_adjusted_momentum": IndicatorFamily.COMPOSITE,
    "regime_detector": IndicatorFamily.COMPOSITE,
}


class ScoringEngine:
    """Combines multi-indicator results into calibrated Confidence, Risk, EV, and Uncertainty."""

    def __init__(
        self,
        profiles: dict[str, TimeframeStrategyProfile] | None = None,
        calibrator: IsotonicCalibrator | None = None,
        conformal: ConformalPredictor | None = None,
    ) -> None:
        self._profiles = profiles or default_timeframe_profiles()
        self._calibrator = calibrator or IsotonicCalibrator()
        self._conformal = conformal or ConformalPredictor()

    def _compute_family_state(
        self,
        engine_output: EngineOutput,
        profile: TimeframeStrategyProfile,
    ) -> tuple[IndicatorFamilyScores, float, float]:
        """Groups indicator results into weighted family scores.

        Shared by score() and fit_calibration() so the calibrator is trained on
        exactly the same pre-calibration signal the live/backtest path scores with.
        """
        results = engine_output.results
        family_results: dict[IndicatorFamily, list[IndicatorResult]] = {f: [] for f in IndicatorFamily}
        for res in results:
            fam = _FAMILY_MAPPING.get(res.name, IndicatorFamily.TECHNICAL)
            family_results[fam].append(res)

        family_scores_dict: dict[str, FamilyScore] = {}
        directional_family_values: list[float] = []

        for fam, items in family_results.items():
            weight = profile.family_weights.get(fam, 0.20)
            if not items:
                family_scores_dict[fam.value] = FamilyScore(
                    family=fam, score=0.0, weight=weight, indicator_count=0, agreement=1.0
                )
                continue

            scores = [i.score for i in items]
            mean_score = float(np.mean(scores))
            agreement = 1.0 - min(1.0, float(np.std(scores))) if len(scores) > 1 else 1.0

            family_scores_dict[fam.value] = FamilyScore(
                family=fam,
                score=mean_score,
                weight=weight,
                indicator_count=len(items),
                agreement=agreement,
            )
            if weight > 0 and len(items) > 0:
                directional_family_values.append(mean_score)

        active_families = [fs for fs in family_scores_dict.values() if fs.indicator_count > 0]
        if len(directional_family_values) >= 2:
            disagreement = min(1.0, float(np.std(directional_family_values)))
        elif len(active_families) == 1:
            # Cross-family disagreement isn't defined with only one family active (e.g.
            # after aggressive relevance pruning leaves indicators from a single family) --
            # but that doesn't mean the surviving indicators agree with each other. Fall
            # back to that family's own internal disagreement (1 - agreement) so two
            # indicators pointing opposite directions don't silently read as maximally
            # confident just because everything else got pruned away.
            disagreement = 1.0 - active_families[0].agreement
        else:
            disagreement = 0.0

        weighted_sum = sum(fs.score * fs.weight for fs in family_scores_dict.values())
        total_weight = sum(fs.weight for fs in family_scores_dict.values() if fs.indicator_count > 0)
        net_score = weighted_sum / max(total_weight, 1e-6)

        family_breakdown = IndicatorFamilyScores(
            families=family_scores_dict,
            cross_family_disagreement=disagreement,
            net_family_score=net_score,
        )
        return family_breakdown, net_score, disagreement

    @staticmethod
    def _raw_prob_input(net_score: float, disagreement: float, regime_stability_score: float) -> float:
        penalty = 1.0 - 0.35 * disagreement
        stability_mod = 0.6 + 0.4 * regime_stability_score
        return net_score * penalty * stability_mod

    def compute_calibration_feature(self, engine_output: EngineOutput, timeframe: str) -> float:
        """Public entry point for backtests/training jobs to compute the same pre-calibration
        signal that score() feeds into the calibrator, without duplicating the family-grouping
        logic and without needing a full score() call (which requires ticker/order_book)."""
        profile = self._profiles.get(timeframe) or self._profiles["1h"]
        _, net_score, disagreement = self._compute_family_state(engine_output, profile)
        return self._raw_prob_input(net_score, disagreement, engine_output.regime_state.stability_score)

    def fit_calibration(self, examples: list[tuple[float, float]]) -> None:
        """Fits the isotonic calibrator and conformal predictor on historical
        (raw_signal, realized_outcome) pairs, where realized_outcome is 1.0 if trading in the
        signal's direction actually won and 0.0 if it lost.

        Without this, p_win is produced by an untrained fallback sigmoid with no empirical
        grounding in real outcomes -- see SCOPE.md §7. Call this once per walk-forward split
        before using the engine for out-of-sample decisions.
        """
        if len(examples) < 20:
            return
        xs = np.array([e[0] for e in examples], dtype=float)
        ys = np.array([e[1] for e in examples], dtype=float)
        self._calibrator.fit(xs, ys)
        preds = np.array([self._calibrator.calibrate(x) for x in xs])
        self._conformal.fit(preds, ys)

    def score(
        self,
        symbol: str,
        timeframe: str,
        engine_output: EngineOutput,
        universe_pair: UniversePair | None = None,
        ticker: Ticker | None = None,
        order_book: OrderBook | None = None,
        market_data: CoinMarketData | None = None,
        avg_win_payoff: float = 2.4,
        avg_loss_payoff: float = 1.0,
    ) -> PairScore:
        profile = self._profiles.get(timeframe) or self._profiles["1h"]
        results = engine_output.results
        regime_state = engine_output.regime_state

        raw_scores: dict[str, float] = {r.name: r.score for r in results}
        reason_codes: list[str] = []

        # 1-3. Group indicators into families, compute agreement & cross-family disagreement
        family_breakdown, net_score, disagreement = self._compute_family_state(engine_output, profile)

        # 4. Data Confidence Score (§3)
        diverged = universe_pair.market_cap_diverged if universe_pair else False
        agreement_factor = 0.5 if diverged else 1.0
        data_conf = (
            0.4 * engine_output.coverage_ratio + 0.3 * agreement_factor + 0.3 * 1.0
        )

        # 5. Calibrated Probability Score
        raw_prob_input = self._raw_prob_input(net_score, disagreement, regime_state.stability_score)

        p_win = self._calibrator.calibrate(raw_prob_input)

        # Dynamic Epistemic Uncertainty Calculation
        # Conformal interval width (real, once fit_calibration() has run; falls back to a fixed
        # default width pre-fit -- see ConformalPredictor.predict_interval_and_uncertainty)
        # + cross-family disagreement entropy + regime transition + liquidity depth.
        #
        # Note on scale: split-conformal interval width is ~constant across candidates
        # within a single fit (it's a global residual quantile, shifted but not rescaled
        # by point_prob) -- it varies over time as the model is refit, not across
        # simultaneously-scored candidates. A per-regime/per-volatility-bucket conformal
        # predictor would make it adaptive; out of scope for now.
        _, _, conformal_uncertainty = self._conformal.predict_interval_and_uncertainty(p_win)
        disagreement_uncertainty = disagreement * 0.18
        regime_uncertainty = (1.0 - regime_state.stability_score) * 0.12
        data_uncertainty = (1.0 - data_conf) * 0.15
        # Deterministic per-instrument variance term (stable across process restarts, unlike
        # Python's salted built-in hash()) -- a small, reproducible spread across symbols/timeframes.
        symbol_hash_variance = (zlib.crc32(f"{symbol}{timeframe}".encode()) % 50) / 1000.0

        # conformal_uncertainty is a width in [0, 1] (can legitimately approach 1.0 for a
        # genuinely noisy single-bar-ahead signal -- SCOPE.md's own baseline is "55-60%
        # accuracy is good"). Weighted at the same ~0.18 max scale as the other terms below
        # so it contributes as one signal among several instead of alone saturating the
        # clamp on every candidate regardless of how the other terms vary.
        conformal_component = conformal_uncertainty * 0.18

        uncertainty = (
            conformal_component
            + disagreement_uncertainty
            + regime_uncertainty
            + data_uncertainty
            + symbol_hash_variance
        )
        # Bounded between 5% and 38%
        uncertainty = max(0.05, min(0.38, uncertainty))

        confidence = max(0.01, min(0.99, p_win * (1.0 - 0.3 * uncertainty)))

        # 6. Independent Risk Score (§7)
        vol_score = 0.5
        atr_res = next((r for r in results if r.name == "atr"), None)
        if atr_res:
            vol_score = max(0.0, min(1.0, 0.5 + atr_res.score * 0.5))

        liq_score = 0.5
        if order_book and order_book.bids and order_book.asks:
            depth = sum(lvl.size * lvl.price for lvl in order_book.bids[:5]) + sum(
                lvl.size * lvl.price for lvl in order_book.asks[:5]
            )
            liq_score = max(0.1, min(0.9, 1.0 - math.tanh(depth / 50_000.0)))
        elif market_data:
            tier_res = next((r for r in results if r.name == "market_cap_tier"), None)
            if tier_res:
                liq_score = 1.0 - max(0.0, min(1.0, tier_res.score))

        crowd_risk = 0.2
        if ticker:
            funding_extreme = abs(ticker.funding_rate) * 500.0
            mark_diff = abs(ticker.mark_price - ticker.index_price) / ticker.index_price * 200.0
            crowd_risk = min(0.8, funding_extreme + mark_diff)

        risk = 0.35 * vol_score + 0.30 * liq_score + 0.20 * (1.0 - data_conf) + 0.15 * crowd_risk
        risk = max(0.05, min(0.95, risk))

        # 7. Expected Value Calculation in R-Multiple (§7)
        # EV_R = P(win) * avg_win_R - (1 - P(win)) * avg_loss_R - friction_R
        spread_bps = 2.0
        if order_book and order_book.best_bid and order_book.best_ask and order_book.mid_price:
            spread_bps = max(1.0, ((order_book.best_ask - order_book.best_bid) / order_book.mid_price) * 10000.0)
        
        friction_r = (spread_bps / 100.0 * 0.05) + (abs(ticker.funding_rate) * 50.0 if ticker else 0.02)
        win_payoff_r = avg_win_payoff * (0.9 + 0.2 * regime_state.stability_score)
        
        expected_value_r = p_win * win_payoff_r - (1.0 - p_win) * avg_loss_payoff - friction_r

        # 8. Reason Codes
        if disagreement > 0.35:
            reason_codes.append("HIGH_FAMILY_DISAGREEMENT")
        if regime_state.stability == StabilityState.TRANSITIONING:
            reason_codes.append("REGIME_TRANSITIONING")
        if data_conf < 0.60:
            reason_codes.append("LOW_DATA_CONFIDENCE")
        if risk > 0.70:
            reason_codes.append("HIGH_RISK")
        if expected_value_r > 0.30 and p_win >= 0.55:
            reason_codes.append("ATTRACTIVE_EV")
        elif expected_value_r <= 0.0:
            reason_codes.append("SUB_THRESHOLD_EV")

        return PairScore(
            symbol=symbol,
            timeframe=timeframe,
            confidence=confidence,
            risk=risk,
            expected_value=expected_value_r,
            epistemic_uncertainty=uncertainty,
            p_win=p_win,
            data_confidence=data_conf,
            family_breakdown=family_breakdown,
            regime_state=regime_state,
            raw_scores=raw_scores,
            reason_codes=reason_codes,
        )
