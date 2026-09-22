"""Decision Ledger repository (spec §18)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain.decision import Decision, DecisionKind, SignalComponent
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sisera_ledger.decision_models import DecisionRow


def decision_to_row(d: Decision) -> DecisionRow:
    return DecisionRow(
        decision_id=d.decision_id,
        timestamp_ms=d.timestamp_ms,
        instrument_id=d.instrument_id,
        symbol=d.symbol,
        direction=d.direction,
        kind=d.kind.value,
        market_snapshot_id=d.market_snapshot_id,
        portfolio_snapshot_id=d.portfolio_snapshot_id,
        strategy_version=d.strategy_version,
        model_version=d.model_version,
        risk_policy_version=d.risk_policy_version,
        execution_policy_version=d.execution_policy_version,
        confidence=d.confidence,
        expected_value=d.expected_value,
        uncertainty=d.uncertainty,
        regime=d.regime,
        features_json={k: str(v) for k, v in d.features.items()} or None,
        signal_components_json=[c.model_dump(mode="json") for c in d.signal_components] or None,
        reason_codes_json=list(d.reason_codes) or None,
        trade_plan_json=d.trade_plan or None,
        risk_result_json=d.risk_result or None,
        approval_result_json=d.approval_result or None,
        route_plan_json=d.route_plan or None,
        fills_json=list(d.fills) or None,
        outcome=d.outcome,
        counterfactual=d.counterfactual,
        attribution_json=d.attribution or None,
    )


def row_to_decision(row: DecisionRow) -> Decision:
    return Decision(
        decision_id=row.decision_id,
        timestamp_ms=row.timestamp_ms,
        instrument_id=row.instrument_id,
        symbol=row.symbol,
        direction=row.direction,
        kind=DecisionKind(row.kind),
        market_snapshot_id=row.market_snapshot_id,
        portfolio_snapshot_id=row.portfolio_snapshot_id,
        strategy_version=row.strategy_version,
        model_version=row.model_version,
        risk_policy_version=row.risk_policy_version,
        execution_policy_version=row.execution_policy_version,
        confidence=Decimal(row.confidence),
        expected_value=Decimal(row.expected_value),
        uncertainty=Decimal(row.uncertainty),
        regime=row.regime,
        features={k: Decimal(v) for k, v in (row.features_json or {}).items()},
        signal_components=tuple(SignalComponent(**c) for c in (row.signal_components_json or [])),
        reason_codes=tuple(row.reason_codes_json or []),
        trade_plan=row.trade_plan_json or {},
        risk_result=row.risk_result_json or {},
        approval_result=row.approval_result_json or {},
        route_plan=row.route_plan_json or {},
        fills=tuple(row.fills_json or []),
        outcome=row.outcome,
        counterfactual=row.counterfactual,
        attribution=row.attribution_json or {},
    )


class DecisionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def record(self, decision: Decision) -> Decision:
        existing = self._session.get(DecisionRow, decision.decision_id)
        if existing is not None:
            return row_to_decision(existing)
        self._session.add(decision_to_row(decision))
        try:
            self._session.flush()
        except IntegrityError:
            self._session.rollback()
            existing = self._session.get(DecisionRow, decision.decision_id)
            if existing is None:
                raise
            return row_to_decision(existing)
        return decision

    def get(self, decision_id: str) -> Decision | None:
        row = self._session.get(DecisionRow, decision_id)
        return row_to_decision(row) if row is not None else None

    def query(
        self,
        *,
        symbol: str | None = None,
        kind: DecisionKind | None = None,
        limit: int = 100,
    ) -> list[Decision]:
        stmt = select(DecisionRow)
        if symbol is not None:
            stmt = stmt.where(DecisionRow.symbol == symbol)
        if kind is not None:
            stmt = stmt.where(DecisionRow.kind == kind.value)
        rows = self._session.execute(
            stmt.order_by(DecisionRow.timestamp_ms.desc()).limit(limit)
        ).scalars().all()
        return [row_to_decision(r) for r in rows]

    def counterfactuals(self) -> list[Decision]:
        rows = self._session.execute(
            select(DecisionRow).where(DecisionRow.counterfactual.is_not(None))
        ).scalars().all()
        return [row_to_decision(r) for r in rows]
