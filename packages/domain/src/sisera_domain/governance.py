"""Model governance (spec §26).

Model registry with versioning and lifecycle (CHALLENGER/SHADOW/CHAMPION/DEGRADED/RETIRED),
Champion/Challenger promotion rules, and drift detection (calibration, feature,
prediction, performance). Models are disabled only through explicit deterministic policy.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ModelStatus(StrEnum):
    CHALLENGER = "CHALLENGER"
    SHADOW = "SHADOW"
    CHAMPION = "CHAMPION"
    DEGRADED = "DEGRADED"
    RETIRED = "RETIRED"


class ModelVersion(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_id: str
    version: str
    created_at_ms: int = 0
    training_dataset: str | None = None
    features: tuple[str, ...] = Field(default_factory=tuple)
    metrics: dict[str, Decimal] = Field(default_factory=dict)
    status: ModelStatus = ModelStatus.CHALLENGER


class PromotionDenied(ValueError):
    pass


class ModelRegistry:
    def __init__(self) -> None:
        self._models: dict[tuple[str, str], ModelVersion] = {}

    def register(self, model: ModelVersion) -> ModelVersion:
        self._models[(model.model_id, model.version)] = model
        return model

    def get(self, model_id: str, version: str) -> ModelVersion | None:
        return self._models.get((model_id, version))

    def champion(self, model_id: str) -> ModelVersion | None:
        for (mid, _), m in self._models.items():
            if mid == model_id and m.status == ModelStatus.CHAMPION:
                return m
        return None

    def challengers(self, model_id: str) -> list[ModelVersion]:
        return [
            m
            for (mid, _), m in self._models.items()
            if mid == model_id and m.status == ModelStatus.CHALLENGER
        ]

    def promote(
        self,
        model_id: str,
        challenger_version: str,
        *,
        metric: str,
        min_samples: int,
        challenger_samples: int,
        require_better: bool = True,
    ) -> ModelVersion:
        """Promote a challenger to champion. Requires the challenger to beat the
        champion on `metric` over at least `min_samples` (deterministic rule)."""
        challenger = self.get(model_id, challenger_version)
        if challenger is None or challenger.status != ModelStatus.CHALLENGER:
            raise PromotionDenied(f"{model_id}@{challenger_version} is not an active challenger")
        if challenger_samples < min_samples:
            raise PromotionDenied(
                f"Insufficient shadow samples ({challenger_samples} < {min_samples})"
            )
        champion = self.champion(model_id)
        if champion is not None and require_better:
            champ_score = champion.metrics.get(metric)
            chall_score = challenger.metrics.get(metric)
            if chall_score is None or champ_score is None:
                raise PromotionDenied(f"Metric {metric!r} missing for comparison")
            if chall_score <= champ_score:
                raise PromotionDenied(
                    f"Challenger {chall_score} does not beat champion {champ_score} on {metric}"
                )
        # Demote the old champion to shadow; promote the challenger.
        if champion is not None:
            self._models[(model_id, champion.version)] = champion.model_copy(
                update={"status": ModelStatus.SHADOW}
            )
        promoted = challenger.model_copy(update={"status": ModelStatus.CHAMPION})
        self._models[(model_id, challenger_version)] = promoted
        return promoted

    def set_status(self, model_id: str, version: str, status: ModelStatus) -> ModelVersion:
        current = self.get(model_id, version)
        if current is None:
            raise KeyError(f"Unknown model {model_id}@{version}")
        updated = current.model_copy(update={"status": status})
        self._models[(model_id, version)] = updated
        return updated


class DriftReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_id: str
    version: str
    calibration_error: Decimal
    samples: int
    drifted: bool
    detail: str = ""


class DriftMonitor:
    """Detects calibration drift: mean predicted probability vs observed win rate."""

    def __init__(self, max_calibration_error: Decimal = Decimal("0.10")) -> None:
        self.max_calibration_error = max_calibration_error

    def check(
        self, model_id: str, version: str, predicted: list[Decimal], observed: list[bool]
    ) -> DriftReport:
        if not predicted or len(predicted) != len(observed):
            return DriftReport(
                model_id=model_id,
                version=version,
                calibration_error=Decimal("0"),
                samples=0,
                drifted=False,
                detail="insufficient data",
            )
        n = len(predicted)
        mean_pred = sum(predicted, Decimal("0")) / n
        mean_obs = Decimal(sum(1 for o in observed if o)) / n
        error = abs(mean_pred - mean_obs)
        drifted = error > self.max_calibration_error
        return DriftReport(
            model_id=model_id,
            version=version,
            calibration_error=error,
            samples=n,
            drifted=drifted,
            detail=f"predicted={mean_pred:.3f} observed={mean_obs:.3f}",
        )
