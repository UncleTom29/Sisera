"""Auth repository (spec §33).

Persists organizations, desks, users, and memberships. Permission evaluation reuses the
deterministic domain `AccessPolicy` loaded from stored memberships.
"""

from __future__ import annotations

from sisera_domain.auth import (
    AccessPolicy,
    Desk,
    Membership,
    Organization,
    Permission,
    Role,
    User,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from sisera_auth.models import DeskRow, MembershipRow, OrganizationRow, UserRow


def _row_to_membership(row: MembershipRow) -> Membership:
    return Membership(
        user_id=row.user_id,
        org_id=row.org_id,
        desk_id=row.desk_id,
        portfolio_id=row.portfolio_id,
        role=Role(row.role),
    )


class AuthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def upsert_organization(self, org: Organization) -> Organization:
        existing = self._session.get(OrganizationRow, org.org_id)
        if existing is None:
            self._session.add(OrganizationRow(org_id=org.org_id, name=org.name))
        else:
            existing.name = org.name
        self._session.flush()
        return org

    def upsert_desk(self, desk: Desk) -> Desk:
        existing = self._session.get(DeskRow, desk.desk_id)
        if existing is None:
            self._session.add(DeskRow(desk_id=desk.desk_id, org_id=desk.org_id, name=desk.name))
        else:
            existing.name = desk.name
        self._session.flush()
        return desk

    def upsert_user(self, user: User) -> User:
        existing = self._session.get(UserRow, user.user_id)
        if existing is None:
            self._session.add(UserRow(user_id=user.user_id, email=user.email, name=user.name))
        else:
            existing.email = user.email
            existing.name = user.name
        self._session.flush()
        return user

    def grant(self, membership: Membership) -> Membership:
        existing = self._session.scalars(
            select(MembershipRow).where(
                MembershipRow.user_id == membership.user_id,
                MembershipRow.org_id == membership.org_id,
                MembershipRow.desk_id == membership.desk_id,
            )
        ).first()
        if existing is None:
            self._session.add(
                MembershipRow(
                    user_id=membership.user_id,
                    org_id=membership.org_id,
                    desk_id=membership.desk_id,
                    portfolio_id=membership.portfolio_id,
                    role=membership.role.value,
                )
            )
        else:
            existing.portfolio_id = membership.portfolio_id
            existing.role = membership.role.value
        self._session.flush()
        return membership

    def revoke(self, user_id: str, org_id: str, desk_id: str | None = None) -> None:
        row = self._session.scalars(
            select(MembershipRow).where(
                MembershipRow.user_id == user_id,
                MembershipRow.org_id == org_id,
                MembershipRow.desk_id == desk_id,
            )
        ).first()
        if row is not None:
            self._session.delete(row)
            self._session.flush()

    def _policy_for(self, user_id: str, org_id: str) -> AccessPolicy:
        rows = self._session.scalars(
            select(MembershipRow).where(
                MembershipRow.user_id == user_id, MembershipRow.org_id == org_id
            )
        ).all()
        return AccessPolicy([_row_to_membership(r) for r in rows])

    def has_permission(
        self,
        user_id: str,
        permission: Permission,
        org_id: str,
        desk_id: str | None = None,
        portfolio_id: str | None = None,
    ) -> bool:
        return self._policy_for(user_id, org_id).has_permission(
            user_id, permission, org_id, desk_id, portfolio_id
        )
