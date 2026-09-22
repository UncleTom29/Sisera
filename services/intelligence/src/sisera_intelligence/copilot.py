"""Sisera AI copilot (spec §20, ADR-008).

Answers questions by assembling deterministic evidence (market data, derivatives,
portfolio, risk, decisions) and asking an LLM to synthesize — never to invent. Facts,
model estimates, inference, and uncertainty are labeled explicitly; the UI renders
evidence separately from synthesis so provenance is visible. The LLM provider is
pluggable (`MockLLMProvider` for tests/paper; a real provider requires credentials).
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class EvidenceKind(StrEnum):
    FACT = "FACT"
    ESTIMATE = "ESTIMATE"
    INFERENCE = "INFERENCE"


class Evidence(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: str
    kind: EvidenceKind
    label: str
    value: str
    confidence: Decimal = Decimal("1")


class CopilotAnswer(BaseModel):
    model_config = ConfigDict(frozen=True)

    question: str
    synthesis: str
    evidence: tuple[Evidence, ...] = Field(default_factory=tuple)
    uncertainty: Decimal = Decimal("0")
    model: str = "mock"


class MarketSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    last_price: Decimal | None = None
    funding_rate: Decimal | None = None
    open_interest: Decimal | None = None
    price_change_24h_pct: Decimal | None = None


class PortfolioSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    equity: Decimal
    exposure: Decimal
    position_notional: Decimal = Decimal("0")


class LLMProvider(Protocol):
    def complete(self, system: str, user: str) -> str: ...


class MockLLMProvider:
    """Deterministic stand-in: echoes the evidence labels it was given (proves grounding)."""

    def complete(self, system: str, user: str) -> str:
        return f"Synthesis based on provided evidence. {user[:200]}"


class Copilot:
    def __init__(self, llm: LLMProvider | None = None, model_name: str = "mock") -> None:
        self._llm = llm or MockLLMProvider()
        self._model = model_name

    def gather_evidence(
        self,
        question: str,
        market: MarketSnapshot | None = None,
        portfolio: PortfolioSnapshot | None = None,
        decisions: list[str] | None = None,
    ) -> list[Evidence]:
        evidence: list[Evidence] = []
        if market is not None:
            if market.last_price is not None:
                evidence.append(
                    Evidence(
                        source="market-data",
                        kind=EvidenceKind.FACT,
                        label=f"{market.instrument_id} last price",
                        value=str(market.last_price),
                    )
                )
            if market.funding_rate is not None:
                evidence.append(
                    Evidence(
                        source="derivatives",
                        kind=EvidenceKind.FACT,
                        label=f"{market.instrument_id} funding rate",
                        value=str(market.funding_rate),
                    )
                )
            if market.open_interest is not None:
                evidence.append(
                    Evidence(
                        source="derivatives",
                        kind=EvidenceKind.FACT,
                        label=f"{market.instrument_id} open interest",
                        value=str(market.open_interest),
                    )
                )
        if portfolio is not None:
            evidence.append(
                Evidence(
                    source="portfolio",
                    kind=EvidenceKind.FACT,
                    label="portfolio equity",
                    value=str(portfolio.equity),
                )
            )
            evidence.append(
                Evidence(
                    source="portfolio",
                    kind=EvidenceKind.FACT,
                    label="portfolio exposure",
                    value=str(portfolio.exposure),
                )
            )
        for d in decisions or []:
            evidence.append(
                Evidence(
                    source="decision-ledger",
                    kind=EvidenceKind.FACT,
                    label="past decision",
                    value=d,
                )
            )
        return evidence

    def analyze(
        self,
        question: str,
        market: MarketSnapshot | None = None,
        portfolio: PortfolioSnapshot | None = None,
        decisions: list[str] | None = None,
    ) -> CopilotAnswer:
        evidence = self.gather_evidence(question, market, portfolio, decisions)
        lines = [f"- [{e.kind.value}] {e.label}: {e.value} (via {e.source})" for e in evidence]
        user_prompt = f"Question: {question}\nEvidence:\n" + "\n".join(lines)
        system_prompt = (
            "You are Sisera, a trading intelligence copilot. Synthesize ONLY from the "
            "provided evidence. Label facts, estimates, inference, and uncertainty "
            "explicitly. Never present a value not in the evidence as a market fact."
        )
        synthesis = self._llm.complete(system_prompt, user_prompt)
        uncertainty = (
            Decimal("0.5") if not evidence else Decimal("0.2")
        )
        return CopilotAnswer(
            question=question,
            synthesis=synthesis,
            evidence=tuple(evidence),
            uncertainty=uncertainty,
            model=self._model,
        )
