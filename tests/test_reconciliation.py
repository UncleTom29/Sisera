from __future__ import annotations

import pytest

from sisera.data.reconciliation import reconcile


def test_values_within_tolerance_not_flagged():
    result = reconcile(primary=100.0, fallback=100.5, tolerance_pct=1.0)
    assert result.value == 100.0
    assert result.source_used == "primary"
    assert not result.diverged


def test_values_beyond_tolerance_flagged_but_primary_still_used():
    result = reconcile(primary=100.0, fallback=110.0, tolerance_pct=1.0)
    assert result.diverged
    assert result.value == 100.0
    assert result.divergence_pct == pytest.approx(10.0)


def test_missing_primary_fails_over_to_fallback():
    result = reconcile(primary=None, fallback=42.0, tolerance_pct=1.0)
    assert result.value == 42.0
    assert result.source_used == "fallback"
    assert not result.diverged


def test_missing_fallback_uses_primary_unflagged():
    result = reconcile(primary=42.0, fallback=None, tolerance_pct=1.0)
    assert result.value == 42.0
    assert result.source_used == "primary"
    assert not result.diverged


def test_both_missing_raises():
    with pytest.raises(ValueError):
        reconcile(primary=None, fallback=None, tolerance_pct=1.0)


def test_zero_primary_and_zero_fallback_not_diverged():
    result = reconcile(primary=0.0, fallback=0.0, tolerance_pct=1.0)
    assert not result.diverged


def test_zero_primary_nonzero_fallback_is_diverged():
    result = reconcile(primary=0.0, fallback=5.0, tolerance_pct=1.0)
    assert result.diverged
    assert result.divergence_pct == 100.0
