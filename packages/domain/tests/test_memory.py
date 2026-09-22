"""Tests for market memory (spec §42)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import MarketMemory, MarketState


def _state(sid: str, f1: str, f2: str, ret: str | None = None) -> MarketState:
    return MarketState(
        state_id=sid,
        features={"f1": Decimal(f1), "f2": Decimal(f2)},
        regime="TRENDING",
        forward_return=Decimal(ret) if ret is not None else None,
        max_drawdown=Decimal("0.02"),
    )


def test_query_returns_nearest_first() -> None:
    mem = MarketMemory()
    mem.store(_state("far", "10", "10", "0.01"))
    mem.store(_state("near", "1.1", "1.0", "0.05"))
    results = mem.query({"f1": Decimal("1"), "f2": Decimal("1")}, k=2)
    assert [r.state.state_id for r in results] == ["near", "far"]
    assert results[0].similarity > results[1].similarity


def test_outcome_stats() -> None:
    mem = MarketMemory()
    mem.store(_state("a", "1", "1", "0.05"))
    mem.store(_state("b", "1", "1", "-0.02"))
    mem.store(_state("c", "1", "1", "0.03"))
    analogs = mem.query({"f1": Decimal("1"), "f2": Decimal("1")}, k=3)
    stats = mem.outcome_stats(analogs)
    assert stats.samples == 3
    assert stats.median_forward_return == Decimal("0.03")
    assert stats.win_rate == Decimal(2) / Decimal(3)


def test_empty_memory_returns_no_analogs() -> None:
    assert MarketMemory().query({"f1": Decimal("1")}) == []


def test_insufficient_outcome_data() -> None:
    mem = MarketMemory()
    mem.store(_state("a", "1", "1", None))
    stats = mem.outcome_stats(mem.query({"f1": Decimal("1")}, k=1))
    assert stats.samples == 1
    assert stats.median_forward_return is None
