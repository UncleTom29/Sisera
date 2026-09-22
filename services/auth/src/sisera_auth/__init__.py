"""Sisera auth service (persistence for spec §33 + Privy verification)."""

from sisera_auth.db import create_db_engine, session_factory
from sisera_auth.models import Base, DeskRow, MembershipRow, OrganizationRow, UserRow
from sisera_auth.privy import PrivyNotConfigured, PrivyVerificationFailed, PrivyVerifier, VerifiedUser
from sisera_auth.repository import AuthRepository

__all__ = [
    "Base",
    "OrganizationRow",
    "DeskRow",
    "UserRow",
    "MembershipRow",
    "AuthRepository",
    "PrivyNotConfigured",
    "PrivyVerificationFailed",
    "PrivyVerifier",
    "VerifiedUser",
    "create_db_engine",
    "session_factory",
]
