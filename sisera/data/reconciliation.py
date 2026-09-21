from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReconciliationResult:
    value: float
    diverged: bool
    divergence_pct: float
    source_used: str  # "primary" or "fallback"


def reconcile(
    primary: float | None,
    fallback: float | None,
    tolerance_pct: float,
) -> ReconciliationResult:
    """Cross-check a primary value against a fallback. See SCOPE.md §3 Data Aggregation & Reconciliation.

    - Both present, within tolerance -> use primary, not flagged.
    - Both present, beyond tolerance -> use primary, flagged as diverged (caller decides
      skip-vs-penalize per §15's still-open reconciliation-strictness question).
    - Primary missing -> fail over to fallback.
    - Fallback missing -> use primary; nothing to cross-check against, so not flagged.
    """
    if primary is None and fallback is None:
        raise ValueError("Both primary and fallback values are missing — nothing to reconcile")

    if primary is None:
        return ReconciliationResult(
            value=fallback, diverged=False, divergence_pct=0.0, source_used="fallback"
        )
    if fallback is None:
        return ReconciliationResult(
            value=primary, diverged=False, divergence_pct=0.0, source_used="primary"
        )

    if primary == 0:
        divergence_pct = 0.0 if fallback == 0 else 100.0
    else:
        divergence_pct = abs(primary - fallback) / abs(primary) * 100

    return ReconciliationResult(
        value=primary,
        diverged=divergence_pct > tolerance_pct,
        divergence_pct=divergence_pct,
        source_used="primary",
    )
