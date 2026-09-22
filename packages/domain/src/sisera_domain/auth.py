"""Organizations and scoped RBAC (spec §33).

Organizations contain desks; users hold roles scoped to an organization, desk, or
portfolio. Permissions are evaluated deterministically against the role map — an LLM or
agent can never grant itself a permission.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class Role(StrEnum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    PORTFOLIO_MANAGER = "PORTFOLIO_MANAGER"
    TRADER = "TRADER"
    RISK_MANAGER = "RISK_MANAGER"
    ANALYST = "ANALYST"
    AUDITOR = "AUDITOR"
    VIEWER = "VIEWER"


class Permission(StrEnum):
    TRADE_CREATE = "trade:create"
    TRADE_APPROVE = "trade:approve"
    TRADE_CANCEL = "trade:cancel"
    PORTFOLIO_VIEW = "portfolio:view"
    RISK_MODIFY = "risk:modify"
    AGENT_DEPLOY = "agent:deploy"
    AGENT_PAUSE = "agent:pause"
    USER_INVITE = "user:invite"
    AUDIT_VIEW = "audit:view"


_ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.OWNER: frozenset(set(Permission)),
    Role.ADMIN: frozenset(set(Permission)),
    Role.PORTFOLIO_MANAGER: frozenset(
        {
            Permission.TRADE_CREATE,
            Permission.TRADE_APPROVE,
            Permission.TRADE_CANCEL,
            Permission.PORTFOLIO_VIEW,
            Permission.AGENT_DEPLOY,
            Permission.AGENT_PAUSE,
            Permission.AUDIT_VIEW,
        }
    ),
    Role.TRADER: frozenset(
        {Permission.TRADE_CREATE, Permission.TRADE_CANCEL, Permission.PORTFOLIO_VIEW}
    ),
    Role.RISK_MANAGER: frozenset(
        {
            Permission.RISK_MODIFY,
            Permission.PORTFOLIO_VIEW,
            Permission.AUDIT_VIEW,
            Permission.AGENT_PAUSE,
        }
    ),
    Role.ANALYST: frozenset({Permission.PORTFOLIO_VIEW, Permission.AUDIT_VIEW}),
    Role.AUDITOR: frozenset({Permission.AUDIT_VIEW, Permission.PORTFOLIO_VIEW}),
    Role.VIEWER: frozenset({Permission.PORTFOLIO_VIEW}),
}


class Organization(BaseModel):
    model_config = ConfigDict(frozen=True)

    org_id: str
    name: str


class Desk(BaseModel):
    model_config = ConfigDict(frozen=True)

    desk_id: str
    org_id: str
    name: str


class User(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: str
    email: str
    name: str | None = None


class Membership(BaseModel):
    """A user's role within a scope (org, desk, or portfolio). Narrower scopes do not
    inherit broader permissions unless explicitly granted."""

    model_config = ConfigDict(frozen=True)

    user_id: str
    org_id: str
    desk_id: str | None = None
    portfolio_id: str | None = None
    role: Role = Role.VIEWER


class AccessPolicy:
    """Deterministic scoped RBAC evaluation."""

    def __init__(self, memberships: list[Membership] | None = None) -> None:
        self._memberships: list[Membership] = list(memberships or [])

    def grant(self, membership: Membership) -> None:
        self._memberships.append(membership)

    def revoke(self, user_id: str, org_id: str, desk_id: str | None = None) -> None:
        self._memberships = [
            m
            for m in self._memberships
            if not (m.user_id == user_id and m.org_id == org_id and m.desk_id == desk_id)
        ]

    def has_permission(
        self,
        user_id: str,
        permission: Permission,
        org_id: str,
        desk_id: str | None = None,
        portfolio_id: str | None = None,
    ) -> bool:
        for m in self._memberships:
            if m.user_id != user_id or m.org_id != org_id:
                continue
            # A desk-scoped membership only applies within that desk.
            if m.desk_id is not None and desk_id != m.desk_id:
                continue
            # A portfolio-scoped membership only applies to that portfolio.
            if m.portfolio_id is not None and portfolio_id != m.portfolio_id:
                continue
            if permission in _ROLE_PERMISSIONS.get(m.role, frozenset()):
                return True
        return False

    def roles_for(self, user_id: str, org_id: str) -> list[Role]:
        return [m.role for m in self._memberships if m.user_id == user_id and m.org_id == org_id]
