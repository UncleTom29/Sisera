"""Typed settings with environment validation and live-trading safety."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEV = "dev"
    TEST = "test"
    STAGING = "staging"
    PROD = "prod"


class Settings(BaseSettings):
    """Canonical Sisera settings.

    Reads from environment variables (prefix `SISERA_`) with a `.env` file fallback.
    Every secret is a `SecretStr` and is never materialized in `repr`, logs, or JSON
    dumps without an explicit call to `get_secret_value()`.
    """

    model_config = SettingsConfigDict(
        env_prefix="SISERA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Top-level / environment ---
    environment: Environment = Environment.DEV

    # --- Live trading safety gate (§53) ---
    live_trading_enabled: bool = False
    use_testnet: bool = True

    # --- Infra (ADR-004) ---
    postgres_url: str = "postgresql+psycopg://sisera:sisera@localhost:5432/sisera"
    clickhouse_url: str = "clickhouse://localhost:9000"
    redis_url: str = "redis://localhost:6379/0"
    nats_url: str = "nats://localhost:4222"
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "sisera"

    # --- Observability (§47) ---
    log_level: str = "INFO"
    otel_enabled: bool = False

    # --- Secrets (never committed, never logged) ---
    bybit_api_key: SecretStr = SecretStr("")
    bybit_api_secret: SecretStr = SecretStr("")

    @field_validator("environment", mode="before")
    @classmethod
    def _lower_environment(cls, v: object) -> object:
        if isinstance(v, str):
            return v.lower()
        return v

    @field_validator("live_trading_enabled", "use_testnet", mode="before")
    @classmethod
    def _parse_bool(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip().lower() in {"1", "true", "yes", "on"}
        return v

    def redacted(self) -> dict[str, str]:
        """A JSON-safe summary safe for logging (secrets masked)."""
        return {
            "environment": self.environment.value,
            "live_trading_enabled": self.live_trading_enabled,
            "use_testnet": self.use_testnet,
            "log_level": self.log_level,
            "postgres_url": self.postgres_url,
            "nats_url": self.nats_url,
            "bybit_api_key_set": bool(self.bybit_api_key.get_secret_value()),
            "bybit_api_secret_set": bool(self.bybit_api_secret.get_secret_value()),
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
