"""Cross-asset intelligence graph (spec §28).

Entities (assets, instruments, companies, protocols, chains, countries, sectors,
indicators, events, prediction markets, wallets) linked by typed relationships with
weights and evidence. Powers exposure queries like "which positions are most exposed if
CPI prints 30bps above consensus?" Causal claims require evidence — edges without it are
queryable as unsupported.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class EntityType(StrEnum):
    ASSET = "ASSET"
    INSTRUMENT = "INSTRUMENT"
    COMPANY = "COMPANY"
    PROTOCOL = "PROTOCOL"
    CHAIN = "CHAIN"
    COUNTRY = "COUNTRY"
    SECTOR = "SECTOR"
    COMMODITY = "COMMODITY"
    CURRENCY = "CURRENCY"
    INDEX = "INDEX"
    ECONOMIC_INDICATOR = "ECONOMIC_INDICATOR"
    EVENT = "EVENT"
    PREDICTION_MARKET = "PREDICTION_MARKET"
    WALLET = "WALLET"
    ENTITY = "ENTITY"
    FUND = "FUND"
    NEWS_EVENT = "NEWS_EVENT"


class RelationType(StrEnum):
    AFFECTS = "AFFECTS"
    CORRELATED_WITH = "CORRELATED_WITH"
    ISSUED_BY = "ISSUED_BY"
    BACKED_BY = "BACKED_BY"
    TRACKS = "TRACKS"
    SETTLES_IN = "SETTLES_IN"
    DEPENDS_ON = "DEPENDS_ON"
    MENTIONED_IN = "MENTIONED_IN"
    EXPOSED_TO = "EXPOSED_TO"
    TRADES = "TRADES"
    OWNS = "OWNS"
    HEDGES = "HEDGES"


class Node(BaseModel):
    model_config = ConfigDict(frozen=True)

    node_id: str
    entity_type: EntityType
    label: str
    metadata: dict = Field(default_factory=dict)


class Edge(BaseModel):
    model_config = ConfigDict(frozen=True)

    from_id: str
    to_id: str
    relation: RelationType
    weight: Decimal = Decimal("0")
    evidence: str | None = None


class Exposure(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    factor_id: str
    notional: Decimal
    sensitivity: Decimal
    impact: Decimal


class IntelligenceGraph:
    def __init__(self) -> None:
        self._nodes: dict[str, Node] = {}
        self._edges: list[Edge] = []

    def add_node(self, node: Node) -> Node:
        self._nodes[node.node_id] = node
        return node

    def add_edge(self, edge: Edge) -> Edge:
        if edge.from_id not in self._nodes or edge.to_id not in self._nodes:
            raise KeyError("Both edge endpoints must be registered nodes")
        self._edges.append(edge)
        return edge

    def neighbors(self, node_id: str, relation: RelationType | None = None) -> list[Node]:
        out: list[Node] = []
        for e in self._edges:
            if e.from_id == node_id and (relation is None or e.relation == relation):
                out.append(self._nodes[e.to_id])
        return out

    def edges_from(self, node_id: str, relation: RelationType | None = None) -> list[Edge]:
        return [
            e
            for e in self._edges
            if e.from_id == node_id and (relation is None or e.relation == relation)
        ]

    def unsupported_causal_claims(self) -> list[Edge]:
        """Edges asserting causation/correlation without evidence."""
        return [
            e
            for e in self._edges
            if e.relation in {RelationType.AFFECTS, RelationType.CORRELATED_WITH} and not e.evidence
        ]

    def correlation(self, a_id: str, b_id: str) -> Decimal | None:
        for e in self._edges:
            if e.relation == RelationType.CORRELATED_WITH and {e.from_id, e.to_id} == {a_id, b_id}:
                return e.weight
        return None

    def exposure_ranking(
        self,
        positions: dict[str, Decimal],
        factor_id: str,
        shock: Decimal,
    ) -> list[Exposure]:
        """Rank positions by impact of a factor shock, propagated via EXPOSED_TO edges."""
        exposures: list[Exposure] = []
        for instrument_id, notional in positions.items():
            sensitivity = Decimal("0")
            for e in self.edges_from(instrument_id, RelationType.EXPOSED_TO):
                if e.to_id == factor_id:
                    sensitivity += e.weight
            exposures.append(
                Exposure(
                    instrument_id=instrument_id,
                    factor_id=factor_id,
                    notional=notional,
                    sensitivity=sensitivity,
                    impact=notional * sensitivity * shock,
                )
            )
        exposures.sort(key=lambda x: abs(x.impact), reverse=True)
        return exposures
