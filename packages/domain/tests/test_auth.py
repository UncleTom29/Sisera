"""Tests for scoped RBAC (spec §33)."""

from __future__ import annotations

from sisera_domain import (
    AccessPolicy,
    Desk,
    Membership,
    Organization,
    Permission,
    Role,
    User,
)


def _policy() -> AccessPolicy:
    p = AccessPolicy()
    p.grant(Membership(user_id="u_trader", org_id="o1", desk_id="d1", role=Role.TRADER))
    p.grant(Membership(user_id="u_pm", org_id="o1", role=Role.PORTFOLIO_MANAGER))
    p.grant(Membership(user_id="u_view", org_id="o1", role=Role.VIEWER))
    return p


def test_trader_can_create_but_not_approve() -> None:
    p = _policy()
    assert p.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d1") is True
    assert p.has_permission("u_trader", Permission.TRADE_APPROVE, "o1", desk_id="d1") is False


def test_pm_can_approve() -> None:
    p = _policy()
    assert p.has_permission("u_pm", Permission.TRADE_APPROVE, "o1") is True


def test_viewer_cannot_trade() -> None:
    p = _policy()
    assert p.has_permission("u_view", Permission.TRADE_CREATE, "o1") is False
    assert p.has_permission("u_view", Permission.PORTFOLIO_VIEW, "o1") is True


def test_org_isolation() -> None:
    p = _policy()
    assert p.has_permission("u_trader", Permission.TRADE_CREATE, "o2", desk_id="d1") is False


def test_desk_scope_does_not_leak() -> None:
    p = _policy()
    # Trader is scoped to desk d1; a different desk gets no permission.
    assert p.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d2") is False


def test_revoke_removes_access() -> None:
    p = _policy()
    p.revoke("u_trader", "o1", desk_id="d1")
    assert p.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d1") is False


def test_roles_for() -> None:
    p = _policy()
    assert p.roles_for("u_pm", "o1") == [Role.PORTFOLIO_MANAGER]


def test_entities_are_value_objects() -> None:
    org = Organization(org_id="o1", name="Acme")
    desk = Desk(desk_id="d1", org_id="o1", name="Crypto")
    user = User(user_id="u1", email="trader@acme.com")
    assert org.name == "Acme"
    assert desk.org_id == "o1"
    assert user.email == "trader@acme.com"
