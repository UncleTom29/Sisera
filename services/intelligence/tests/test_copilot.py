"""Tests for the AI copilot (spec §20)."""

from __future__ import annotations

from decimal import Decimal

from sisera_intelligence import (
    Copilot,
    EvidenceKind,
    MarketSnapshot,
    PortfolioSnapshot,
)


def _market() -> MarketSnapshot:
    return MarketSnapshot(
        instrument_id="ETH",
        last_price=Decimal("3480"),
        funding_rate=Decimal("0.0001"),
        open_interest=Decimal("500000"),
        price_change_24h_pct=Decimal("-2.5"),
    )


def _portfolio() -> PortfolioSnapshot:
    return PortfolioSnapshot(equity=Decimal("100000"), exposure=Decimal("30000"))


def test_gather_evidence_labels_facts() -> None:
    copilot = Copilot()
    evidence = copilot.gather_evidence("Why is ETH down?", market=_market(), portfolio=_portfolio())
    kinds = {e.kind for e in evidence}
    assert kinds == {EvidenceKind.FACT}
    labels = {e.label for e in evidence}
    assert "ETH last price" in labels
    assert "portfolio equity" in labels


def test_analyze_returns_evidence_and_synthesis() -> None:
    copilot = Copilot()
    answer = copilot.analyze("Why is ETH underperforming?", market=_market(), portfolio=_portfolio())
    assert len(answer.evidence) > 0
    assert answer.synthesis != ""
    assert answer.uncertainty >= 0


def test_empty_context_yields_high_uncertainty() -> None:
    copilot = Copilot()
    answer = copilot.analyze("What should I do?")
    assert answer.uncertainty == Decimal("0.5")
    assert answer.evidence == ()


def test_decisions_included_as_evidence() -> None:
    copilot = Copilot()
    answer = copilot.analyze("Why no trade?", decisions=["NO_TRADE low EV"])
    assert any(e.source == "decision-ledger" for e in answer.evidence)
