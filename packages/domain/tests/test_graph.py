"""Tests for the cross-asset intelligence graph (spec §28)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import (
    Edge,
    EntityType,
    IntelligenceGraph,
    Node,
    RelationType,
)


def _graph() -> IntelligenceGraph:
    g = IntelligenceGraph()
    g.add_node(Node(node_id="btc", entity_type=EntityType.ASSET, label="BTC"))
    g.add_node(Node(node_id="eth", entity_type=EntityType.ASSET, label="ETH"))
    g.add_node(Node(node_id="cpi", entity_type=EntityType.ECONOMIC_INDICATOR, label="CPI"))
    g.add_node(Node(node_id="btc_perp", entity_type=EntityType.INSTRUMENT, label="BTC-PERP"))
    g.add_edge(Edge(from_id="btc_perp", to_id="btc", relation=RelationType.TRACKS, weight=Decimal("1")))
    g.add_edge(
        Edge(
            from_id="btc_perp",
            to_id="cpi",
            relation=RelationType.EXPOSED_TO,
            weight=Decimal("-0.5"),
            evidence="rates selloff beta",
        )
    )
    g.add_edge(
        Edge(
            from_id="btc",
            to_id="eth",
            relation=RelationType.CORRELATED_WITH,
            weight=Decimal("0.85"),
            evidence="90d rolling",
        )
    )
    return g


def test_neighbors_and_correlation() -> None:
    g = _graph()
    assert [n.node_id for n in g.neighbors("btc_perp", RelationType.TRACKS)] == ["btc"]
    assert g.correlation("btc", "eth") == Decimal("0.85")
    assert g.correlation("btc", "cpi") is None


def test_exposure_ranking() -> None:
    g = _graph()
    ranking = g.exposure_ranking(
        {"btc_perp": Decimal("60000")}, factor_id="cpi", shock=Decimal("0.003")
    )
    assert len(ranking) == 1
    assert ranking[0].impact == Decimal("60000") * Decimal("-0.5") * Decimal("0.003")
    assert ranking[0].sensitivity == Decimal("-0.5")


def test_exposure_sorts_by_abs_impact() -> None:
    g = IntelligenceGraph()
    g.add_node(Node(node_id="a", entity_type=EntityType.INSTRUMENT, label="A"))
    g.add_node(Node(node_id="b", entity_type=EntityType.INSTRUMENT, label="B"))
    g.add_node(Node(node_id="f", entity_type=EntityType.ECONOMIC_INDICATOR, label="F"))
    g.add_edge(Edge(from_id="a", to_id="f", relation=RelationType.EXPOSED_TO, weight=Decimal("0.1")))
    g.add_edge(Edge(from_id="b", to_id="f", relation=RelationType.EXPOSED_TO, weight=Decimal("-2")))
    ranking = g.exposure_ranking({"a": Decimal("100"), "b": Decimal("100")}, "f", Decimal("1"))
    assert [e.instrument_id for e in ranking] == ["b", "a"]


def test_unsupported_causal_claims_flagged() -> None:
    g = IntelligenceGraph()
    g.add_node(Node(node_id="a", entity_type=EntityType.ASSET, label="A"))
    g.add_node(Node(node_id="b", entity_type=EntityType.ASSET, label="B"))
    g.add_edge(Edge(from_id="a", to_id="b", relation=RelationType.AFFECTS, weight=Decimal("1")))
    assert len(g.unsupported_causal_claims()) == 1


def test_edge_requires_registered_nodes() -> None:
    g = IntelligenceGraph()
    with pytest.raises(KeyError):
        g.add_edge(Edge(from_id="x", to_id="y", relation=RelationType.TRACKS))
