"""Engine/session factory for the ledger service."""

from __future__ import annotations

from sisera_config import get_settings
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def create_db_engine(url: str | None = None) -> Engine:
    """Create a SQLAlchemy engine. Defaults to the configured Postgres URL.

    For tests, pass a SQLite URL (e.g. "sqlite+pysqlite:///:memory:"); the ORM models are
    written against the SQLAlchemy core types so they work across both dialects.
    """
    target = url or get_settings().postgres_url
    if target.startswith("sqlite"):
        return create_engine(target, future=True)
    return create_engine(target, future=True, pool_pre_ping=True)


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)
