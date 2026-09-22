"""Test that OMS migrations apply from a clean state."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

OMS_DIR = Path(__file__).resolve().parents[1]


def test_migrations_apply_from_clean_state(tmp_path: Path) -> None:
    db_path = tmp_path / "oms.db"
    url = f"sqlite+pysqlite:///{db_path}"

    cfg = Config(str(OMS_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(OMS_DIR / "alembic"))
    cfg.attributes["configure_logger"] = False
    cfg.cmd_opts = type("Opts", (), {"x": [f"db_url={url}"]})()

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert {"orders", "order_lifecycle", "alembic_version_oms"} <= tables
