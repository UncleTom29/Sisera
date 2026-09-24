"""Tests for model governance (spec §26)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import (
    DriftMonitor,
    ModelRegistry,
    ModelStatus,
    ModelVersion,
    PromotionDenied,
)


def _model(version: str, status: ModelStatus, sharpe: str) -> ModelVersion:
    return ModelVersion(
        model_id="momentum",
        version=version,
        training_dataset="bars_2024",
        features=("momentum", "funding"),
        metrics={"sharpe": Decimal(sharpe)},
        status=status,
    )


def test_champion_and_challenger_lookup() -> None:
    r = ModelRegistry()
    r.register(_model("v1", ModelStatus.CHAMPION, "1.2"))
    r.register(_model("v2", ModelStatus.CHALLENGER, "1.5"))
    assert r.champion("momentum").version == "v1"
    assert [c.version for c in r.challengers("momentum")] == ["v2"]


def test_promote_beating_challenger() -> None:
    r = ModelRegistry()
    r.register(_model("v1", ModelStatus.CHAMPION, "1.2"))
    r.register(_model("v2", ModelStatus.CHALLENGER, "1.5"))
    promoted = r.promote("momentum", "v2", metric="sharpe", min_samples=100, challenger_samples=150)
    assert promoted.status == ModelStatus.CHAMPION
    assert r.get("momentum", "v1").status == ModelStatus.SHADOW


def test_promote_losing_challenger_denied() -> None:
    r = ModelRegistry()
    r.register(_model("v1", ModelStatus.CHAMPION, "1.5"))
    r.register(_model("v2", ModelStatus.CHALLENGER, "1.2"))
    with pytest.raises(PromotionDenied):
        r.promote("momentum", "v2", metric="sharpe", min_samples=100, challenger_samples=150)


def test_promote_insufficient_samples_denied() -> None:
    r = ModelRegistry()
    r.register(_model("v1", ModelStatus.CHAMPION, "1.2"))
    r.register(_model("v2", ModelStatus.CHALLENGER, "1.5"))
    with pytest.raises(PromotionDenied):
        r.promote("momentum", "v2", metric="sharpe", min_samples=100, challenger_samples=10)


def test_set_status() -> None:
    r = ModelRegistry()
    r.register(_model("v1", ModelStatus.CHAMPION, "1.2"))
    assert r.set_status("momentum", "v1", ModelStatus.DEGRADED).status == ModelStatus.DEGRADED


def test_drift_detected_on_miscalibration() -> None:
    monitor = DriftMonitor(max_calibration_error=Decimal("0.10"))
    # Predicts 80% but wins 50% -> drifted.
    report = monitor.check(
        "m",
        "v1",
        predicted=[Decimal("0.8")] * 20,
        observed=[True] * 10 + [False] * 10,
    )
    assert report.drifted is True
    assert report.samples == 20


def test_no_drift_when_calibrated() -> None:
    monitor = DriftMonitor(max_calibration_error=Decimal("0.10"))
    report = monitor.check(
        "m",
        "v1",
        predicted=[Decimal("0.6")] * 20,
        observed=[True] * 12 + [False] * 8,
    )
    assert report.drifted is False


def test_status_enum_covers_lifecycle() -> None:
    assert {s.value for s in ModelStatus} == {
        "CHALLENGER",
        "SHADOW",
        "CHAMPION",
        "DEGRADED",
        "RETIRED",
    }
