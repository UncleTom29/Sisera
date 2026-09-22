"""Test that Alembic migrations create the schema from a clean state (spec §65)."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

LEDGER_DIR = Path(__file__).resolve().parents[1]


def test_migrations_apply_from_clean_state(tmp_path: Path) -> None:
    db_path = tmp_path / "ledger.db"
    url = f"sqlite+pysqlite:///{db_path}"

    cfg = Config(str(LEDGER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(LEDGER_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    # Override the settings-provided Postgres URL with the SQLite test URL.
    cfg.cmd_opts = type("Opts", (), {"x": [f"db_url={url}"]})()

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert {"ledger_entries", "ledger_postings"} <= tables
    assert "alembic_version" in tables


def test_migrations_downgrade_and_upgrade(tmp_path: Path) -> None:
    db_path = tmp_path / "ledger.db"
    url = f"sqlite+pysqlite:///{db_path}"

    cfg = Config(str(LEDGER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(LEDGER_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    cfg.cmd_opts = type("Opts", (), {"x": [f"db_url={url}"]})()

    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert "ledger_entries" not in tables
    assert "ledger_postings" not in tables
