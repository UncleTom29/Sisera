"""Tests for the auth repository."""

from __future__ import annotations

import pytest
from sisera_auth import AuthRepository, Base, create_db_engine, session_factory
from sisera_domain import Desk, Membership, Organization, Permission, Role, User
from sqlalchemy.orm import Session


@pytest.fixture
def session() -> Session:
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = session_factory(engine)()
    try:
        yield session
    finally:
        session.close()


def _seed(repo: AuthRepository) -> None:
    repo.upsert_organization(Organization(org_id="o1", name="Acme"))
    repo.upsert_desk(Desk(desk_id="d1", org_id="o1", name="Crypto"))
    repo.upsert_user(User(user_id="u_trader", email="trader@acme.com"))
    repo.grant(Membership(user_id="u_trader", org_id="o1", desk_id="d1", role=Role.TRADER))


def test_grant_and_permission_check(session: Session) -> None:
    repo = AuthRepository(session)
    _seed(repo)
    session.commit()
    assert repo.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d1") is True
    assert repo.has_permission("u_trader", Permission.TRADE_APPROVE, "o1", desk_id="d1") is False


def test_revoke_removes_access(session: Session) -> None:
    repo = AuthRepository(session)
    _seed(repo)
    repo.revoke("u_trader", "o1", desk_id="d1")
    session.commit()
    assert repo.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d1") is False


def test_org_isolation(session: Session) -> None:
    repo = AuthRepository(session)
    _seed(repo)
    session.commit()
    assert repo.has_permission("u_trader", Permission.TRADE_CREATE, "o2", desk_id="d1") is False


def test_grant_is_idempotent(session: Session) -> None:
    repo = AuthRepository(session)
    _seed(repo)
    repo.grant(Membership(user_id="u_trader", org_id="o1", desk_id="d1", role=Role.TRADER))
    session.commit()
    assert repo.has_permission("u_trader", Permission.TRADE_CREATE, "o1", desk_id="d1") is True
