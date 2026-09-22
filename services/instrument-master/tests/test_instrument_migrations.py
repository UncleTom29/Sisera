"""Test that instrument-master migrations apply from a clean state."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

DIR = Path(__file__).resolve().parents[1]


def test_migrations_apply_from_clean_state(tmp_path: Path) -> None:
    db_path = tmp_path / "instruments.db"
    url = f"sqlite+pysqlite:///{db_path}"

    cfg = Config(str(DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    cfg.cmd_opts = type("Opts", (), {"x": [f"db_url={url}"]})()

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    expected = {"canonical_assets", "venue_instruments", "instruments", "alembic_version_instruments"}
    assert expected <= tables
