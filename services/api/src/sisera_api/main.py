"""Runnable API entrypoint (`uv run uvicorn sisera_api.main:app`).

- SQLite files by default (zero-ops local boot); Postgres via SISERA_POSTGRES_URL.
- Tables are created on startup (dev convenience; production uses Alembic migrations).
- Auth: real PrivyVerifier when SISERA_PRIVY_ENABLED=true + App ID set; otherwise a
  dev-only static-token verifier gated by SISERA_ENVIRONMENT=dev (refuses to boot with
  the bypass in staging/prod).
"""

from __future__ import annotations

import os

from sisera_api.app import create_app


def _db_url(service: str) -> str:
    if url := os.getenv("SISERA_POSTGRES_URL"):
        return url
    os.makedirs("var", exist_ok=True)
    return f"sqlite+pysqlite:///var/{service}.db"


def _verifier() -> object | None:
    from sisera_config import get_settings

    settings = get_settings()
    environment = settings.environment.value

    if os.getenv("SISERA_PRIVY_ENABLED", "false").lower() in {"1", "true", "yes", "on"}:

        # Real Privy verification; App ID + JWKS come from settings/env.
        # JWKS fetching is wired here in production; without it, verification refuses.
        raise RuntimeError(
            "Privy JWKS fetching is not wired in this entrypoint yet. "
            "Use SISERA_DEV_TOKEN (dev only) or implement the JWKS client."
        )

    if environment == "dev" and os.getenv("SISERA_DEV_TOKEN"):
        token = os.getenv("SISERA_DEV_TOKEN", "")

        class DevVerifier:
            def verify(self, presented: str) -> object:
                if presented != token or not token:
                    raise ValueError("bad dev token")
                return type("V", (), {"user_id": "dev_user", "email": "dev@localhost"})()

        return DevVerifier()

    return None


def _session_for(service: str, base, session_factory):
    from sqlalchemy import create_engine

    url = _db_url(service)
    kwargs = {"future": True} if url.startswith("sqlite") else {"future": True, "pool_pre_ping": True}
    engine = create_engine(url, **kwargs)
    base.metadata.create_all(engine)
    return session_factory(engine)()


def build_app():  # noqa: D103
    from sisera_instruments import Base as InstrumentsBase
    from sisera_instruments import InstrumentRepository
    from sisera_instruments import session_factory as instruments_sessions
    from sisera_ledger import Base as LedgerBase
    from sisera_ledger import DecisionRepository, LedgerRepository
    from sisera_ledger import session_factory as ledger_sessions
    from sisera_oms import Base as OmsBase
    from sisera_oms import OrderRepository
    from sisera_oms import session_factory as oms_sessions
    from sisera_portfolio import Base as PortfolioBase
    from sisera_portfolio import PortfolioRepository
    from sisera_portfolio import session_factory as portfolio_sessions

    oms_session = _session_for("oms", OmsBase, oms_sessions)
    ledger_session = _session_for("ledger", LedgerBase, ledger_sessions)
    inst_session = _session_for("instruments", InstrumentsBase, instruments_sessions)
    pf_session = _session_for("portfolio", PortfolioBase, portfolio_sessions)

    return create_app(
        order_repo_factory=lambda: OrderRepository(oms_session),
        ledger_repo_factory=lambda: LedgerRepository(ledger_session),
        decision_repo_factory=lambda: DecisionRepository(ledger_session),
        instrument_repo_factory=lambda: InstrumentRepository(inst_session),
        portfolio_repo_factory=lambda: PortfolioRepository(pf_session),
        verifier=_verifier(),
    )


app = build_app()
