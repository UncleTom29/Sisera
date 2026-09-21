"""Confidence Calibration, Epistemic Uncertainty, Champion/Challenger & Drift Detection.

See SCOPE.md §7:
- Gradient-boosted model predicting hit-probability on aggregated category state features.
- Isotonic regression calibration into true probabilities.
- Conformal prediction interval width as explicit epistemic uncertainty.
- Champion/Challenger shadow execution and statistical promotion.
- Drift detection across calibration, features, and regimes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class AggregatedStateFeatures:
    """Aggregated state features per category. See SCOPE.md §7."""

    technical_state: float  # -1.0 to 1.0 (consensus technical trend/momentum)
    derivatives_state: float  # -1.0 to 1.0 (funding, OI, basis, long/short)
    liquidity_state: float  # 0.0 to 1.0 (depth & volume health)
    volatility_state: float  # 0.0 to 1.0 (volatility elevation vs. baseline)
    cross_venue_state: float  # -1.0 to 1.0 (exchange divergence)
    regime_state: float  # -1.0 to 1.0 (mean-reverting vs trending)
    regime_stability: float  # 0.0 to 1.0 (stability score)
    crowding_state: float  # -1.0 to 1.0 (smart-money / crowd exhaustion)

    def to_vector(self) -> np.ndarray:
        return np.array(
            [
                self.technical_state,
                self.derivatives_state,
                self.liquidity_state,
                self.volatility_state,
                self.cross_venue_state,
                self.regime_state,
                self.regime_stability,
                self.crowding_state,
            ],
            dtype=float,
        )


class DecisionStump:
    """Single-split decision stump for Gradient Boosting."""

    def __init__(self) -> None:
        self.feature_idx: int = 0
        self.threshold: float = 0.0
        self.val_left: float = 0.0
        self.val_right: float = 0.0

    def fit(self, X: np.ndarray, residuals: np.ndarray) -> None:
        n_samples, n_features = X.shape
        best_mse = float("inf")

        for f in range(n_features):
            values = np.unique(X[:, f])
            if len(values) <= 1:
                continue
            thresholds = (values[:-1] + values[1:]) / 2.0
            # Sample thresholds if too many
            if len(thresholds) > 20:
                thresholds = np.quantile(thresholds, np.linspace(0.05, 0.95, 20))

            for th in thresholds:
                left_mask = X[:, f] <= th
                right_mask = ~left_mask
                if not np.any(left_mask) or not np.any(right_mask):
                    continue

                left_mean = float(np.mean(residuals[left_mask]))
                right_mean = float(np.mean(residuals[right_mask]))

                mse = np.sum((residuals[left_mask] - left_mean) ** 2) + np.sum(
                    (residuals[right_mask] - right_mean) ** 2
                )
                if mse < best_mse:
                    best_mse = mse
                    self.feature_idx = f
                    self.threshold = float(th)
                    self.val_left = left_mean
                    self.val_right = right_mean

    def predict(self, X: np.ndarray) -> np.ndarray:
        if X.ndim == 1:
            X = X.reshape(1, -1)
        preds = np.where(X[:, self.feature_idx] <= self.threshold, self.val_left, self.val_right)
        return preds


class SimpleGradientBoostedEstimator:
    """Gradient boosted tree regressor in pure NumPy. See SCOPE.md §7."""

    def __init__(self, n_estimators: int = 25, learning_rate: float = 0.1) -> None:
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.trees: list[DecisionStump] = []
        self.base_pred: float = 0.0

    def fit(self, X: np.ndarray, y: np.ndarray) -> SimpleGradientBoostedEstimator:
        self.base_pred = float(np.mean(y))
        current_preds = np.full(len(y), self.base_pred, dtype=float)
        self.trees = []

        for _ in range(self.n_estimators):
            residuals = y - current_preds
            stump = DecisionStump()
            stump.fit(X, residuals)
            step_preds = stump.predict(X)
            current_preds += self.learning_rate * step_preds
            self.trees.append(stump)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if X.ndim == 1:
            X = X.reshape(1, -1)
        preds = np.full(X.shape[0], self.base_pred, dtype=float)
        for stump in self.trees:
            preds += self.learning_rate * stump.predict(X)
        return preds


class IsotonicCalibrator:
    """Pair-adjacent violators (PAV) algorithm for monotonic isotonic calibration."""

    def __init__(self) -> None:
        self.x_thresholds: np.ndarray = np.array([])
        self.y_calibrated: np.ndarray = np.array([])

    def fit(self, uncalibrated_preds: np.ndarray, true_labels: np.ndarray) -> IsotonicCalibrator:
        order = np.argsort(uncalibrated_preds)
        x_sorted = uncalibrated_preds[order]
        y_sorted = true_labels[order].astype(float)

        # PAV Algorithm
        blocks = [[y_sorted[i], 1, x_sorted[i]] for i in range(len(y_sorted))]
        i = 0
        while i < len(blocks) - 1:
            if blocks[i][0] > blocks[i + 1][0]:
                # Merge blocks
                w1, w2 = blocks[i][1], blocks[i + 1][1]
                avg = (blocks[i][0] * w1 + blocks[i + 1][0] * w2) / (w1 + w2)
                blocks[i] = [avg, w1 + w2, blocks[i + 1][2]]
                del blocks[i + 1]
                if i > 0:
                    i -= 1
            else:
                i += 1

        self.x_thresholds = np.array([b[2] for b in blocks])
        self.y_calibrated = np.clip(np.array([b[0] for b in blocks]), 0.01, 0.99)
        return self

    def calibrate(self, raw_score: float) -> float:
        if len(self.x_thresholds) == 0:
            # Fallback sigmoid if uncalibrated
            return float(1.0 / (1.0 + math.exp(-raw_score * 3.0)))
        idx = int(np.searchsorted(self.x_thresholds, raw_score))
        if idx == 0:
            return float(self.y_calibrated[0])
        if idx >= len(self.y_calibrated):
            return float(self.y_calibrated[-1])
        # Linear interpolation
        x0, x1 = self.x_thresholds[idx - 1], self.x_thresholds[idx]
        y0, y1 = self.y_calibrated[idx - 1], self.y_calibrated[idx]
        if abs(x1 - x0) < 1e-9:
            return float(y0)
        t = (raw_score - x0) / (x1 - x0)
        return float(np.clip(y0 + t * (y1 - y0), 0.01, 0.99))


class ConformalPredictor:
    """Conformal prediction for distribution-free uncertainty interval estimation."""

    def __init__(self, alpha: float = 0.10) -> None:
        self.alpha = alpha
        self.residuals: np.ndarray = np.array([])

    def fit(self, preds: np.ndarray, y_true: np.ndarray) -> None:
        self.residuals = np.sort(np.abs(preds - y_true))

    def predict_interval_and_uncertainty(self, point_prob: float) -> tuple[float, float, float]:
        """Returns (p_lower, p_upper, epistemic_uncertainty)."""
        if len(self.residuals) == 0:
            # Default uncalibrated interval
            uncertainty = 0.25
            return max(0.0, point_prob - 0.125), min(1.0, point_prob + 0.125), uncertainty

        q_idx = int(math.ceil((1.0 - self.alpha) * (len(self.residuals) + 1))) - 1
        q_idx = min(max(0, q_idx), len(self.residuals) - 1)
        radius = float(self.residuals[q_idx])

        p_lower = max(0.0, point_prob - radius)
        p_upper = min(1.0, point_prob + radius)
        uncertainty = p_upper - p_lower
        return p_lower, p_upper, uncertainty


@dataclass
class ChampionChallengerResult:
    champion_brier_score: float
    challenger_brier_score: float
    evaluations_count: int
    challenger_promoted: bool
    promotion_reason: str


class ChampionChallengerTracker:
    """Shadow execution of Challenger model vs live Champion model. See SCOPE.md §7."""

    def __init__(self, min_shadow_evaluations: int = 50, improvement_margin: float = 0.03) -> None:
        self.min_shadow_evaluations = min_shadow_evaluations
        self.improvement_margin = improvement_margin
        self.champion_history: list[tuple[float, float]] = []  # (predicted_prob, actual_outcome)
        self.challenger_history: list[tuple[float, float]] = []

    def record_outcome(self, champ_prob: float, chall_prob: float, actual_win: float) -> None:
        self.champion_history.append((champ_prob, actual_win))
        self.challenger_history.append((chall_prob, actual_win))

    def evaluate(self) -> ChampionChallengerResult:
        n = len(self.champion_history)
        if n < self.min_shadow_evaluations:
            return ChampionChallengerResult(
                champion_brier_score=0.0,
                challenger_brier_score=0.0,
                evaluations_count=n,
                challenger_promoted=False,
                promotion_reason=f"Insufficient shadow evaluations: {n}/{self.min_shadow_evaluations}",
            )

        champ_brier = float(np.mean([(p - y) ** 2 for p, y in self.champion_history]))
        chall_brier = float(np.mean([(p - y) ** 2 for p, y in self.challenger_history]))

        # Lower Brier score is better
        improvement = (champ_brier - chall_brier) / max(champ_brier, 1e-6)
        promoted = improvement >= self.improvement_margin

        if promoted:
            reason = (
                f"Challenger improved Brier score by {improvement:.2%} "
                f"(champion={champ_brier:.4f}, challenger={chall_brier:.4f})"
            )
        else:
            reason = (
                f"Challenger improvement {improvement:.2%} below "
                f"required margin {self.improvement_margin:.2%}"
            )

        return ChampionChallengerResult(
            champion_brier_score=champ_brier,
            challenger_brier_score=chall_brier,
            evaluations_count=n,
            challenger_promoted=promoted,
            promotion_reason=reason,
        )


@dataclass
class DriftReport:
    has_drift: bool
    calibration_drift: float  # |predicted_win_rate - observed_win_rate|
    feature_drift_psi: float
    regime_drift_detected: bool
    recommended_action: str  # "NONE" | "REDUCE_SIZING" | "RETRAIN" | "DISABLE_PROFILE"


class DriftDetector:
    """Monitors calibration drift, feature drift, and regime shifts. See SCOPE.md §7."""

    def __init__(
        self,
        calibration_drift_threshold: float = 0.12,
        psi_threshold: float = 0.25,
        window_size: int = 40,
    ) -> None:
        self.calibration_drift_threshold = calibration_drift_threshold
        self.psi_threshold = psi_threshold
        self.window_size = window_size
        self.predictions: list[float] = []
        self.outcomes: list[float] = []
        self.feature_baseline: np.ndarray | None = None

    def set_feature_baseline(self, baseline_features: np.ndarray) -> None:
        self.feature_baseline = baseline_features

    def record_step(self, predicted_p: float, outcome: float) -> None:
        self.predictions.append(predicted_p)
        self.outcomes.append(outcome)
        if len(self.predictions) > self.window_size * 2:
            self.predictions.pop(0)
            self.outcomes.pop(0)

    def check_drift(self, recent_features: np.ndarray | None = None) -> DriftReport:
        if len(self.predictions) < self.window_size:
            return DriftReport(
                has_drift=False,
                calibration_drift=0.0,
                feature_drift_psi=0.0,
                regime_drift_detected=False,
                recommended_action="NONE",
            )

        mean_pred = float(np.mean(self.predictions[-self.window_size :]))
        mean_outcome = float(np.mean(self.outcomes[-self.window_size :]))
        cal_drift = abs(mean_pred - mean_outcome)

        psi = 0.0
        if self.feature_baseline is not None and recent_features is not None:
            # Simple PSI approximation
            b_mean = np.mean(self.feature_baseline, axis=0)
            r_mean = np.mean(recent_features, axis=0)
            psi = float(np.mean((b_mean - r_mean) ** 2))

        has_cal_drift = cal_drift > self.calibration_drift_threshold
        has_feat_drift = psi > self.psi_threshold

        has_drift = has_cal_drift or has_feat_drift

        action = "NONE"
        if has_cal_drift and cal_drift > self.calibration_drift_threshold * 1.5:
            action = "DISABLE_PROFILE"
        elif has_drift:
            action = "REDUCE_SIZING"

        return DriftReport(
            has_drift=has_drift,
            calibration_drift=cal_drift,
            feature_drift_psi=psi,
            regime_drift_detected=has_feat_drift,
            recommended_action=action,
        )
