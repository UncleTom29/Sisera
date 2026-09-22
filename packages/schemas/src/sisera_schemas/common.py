"""Shared event provenance fields (spec §9, ADR-010)."""

from __future__ import annotations

import time
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DataQuality(StrEnum):
    LIVE = "LIVE"
    DELAYED = "DELAYED"
    STALE = "STALE"
    DEGRADED = "DEGRADED"
    UNAVAILABLE = "UNAVAILABLE"


class EventHeader(BaseModel):
    """Fields every canonical event must carry."""

    model_config = ConfigDict(frozen=True)

    event_timestamp_ms: int = Field(
        default_factory=lambda: int(time.time() * 1000),
        description="Wall-clock time this event was created by Sisera (ms epoch).",
    )
    source_timestamp_ms: int | None = Field(
        default=None, description="Timestamp as reported by the source venue (ms epoch)."
    )
    ingestion_timestamp_ms: int = Field(
        default_factory=lambda: int(time.time() * 1000),
        description="Wall-clock time this event entered Sisera's ingestion pipeline.",
    )
    source: str
    instrument_id: str
    quality: DataQuality = DataQuality.LIVE
    sequence: int | None = Field(
        default=None, description="Monotonic source sequence number where available."
    )
    correlation_id: str | None = Field(
        default=None,
        description="Propagates user action -> intent -> risk -> order -> fill -> ledger.",
    )
    metadata: dict[str, Any] = Field(default_factory=dict)
