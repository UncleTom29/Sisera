"""Observability primitives (spec §47).

Structured JSON logging, correlation-ID propagation
(`user action -> intent -> risk -> order -> execution -> fill -> ledger`), and in-memory
metrics with the §47 names. OpenTelemetry exporter wiring (Prometheus/Grafana/Loki) is
pending infrastructure; these primitives are exporter-agnostic.
"""

from __future__ import annotations

import contextvars
import json
import logging
import time
import uuid
from collections import defaultdict

_correlation_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "sisera_correlation_id", default=None
)


def new_correlation_id() -> str:
    cid = uuid.uuid4().hex
    _correlation_id.set(cid)
    return cid


def get_correlation_id() -> str | None:
    return _correlation_id.get()


def set_correlation_id(correlation_id: str) -> None:
    _correlation_id.set(correlation_id)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": get_correlation_id(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


class Metrics:
    """In-memory counters and latency summaries keyed by the §47 metric names."""

    def __init__(self) -> None:
        self._counters: dict[str, int] = defaultdict(int)
        self._latencies: dict[str, list[float]] = defaultdict(list)

    def increment(self, name: str, amount: int = 1) -> None:
        self._counters[name] += amount

    def observe_latency(self, name: str, seconds: float) -> None:
        self._latencies[name].append(seconds)

    def count(self, name: str) -> int:
        return self._counters.get(name, 0)

    def avg_latency(self, name: str) -> float | None:
        samples = self._latencies.get(name, [])
        return sum(samples) / len(samples) if samples else None

    def snapshot(self) -> dict[str, float | int]:
        out: dict[str, float | int] = dict(self._counters)
        for name, samples in self._latencies.items():
            if samples:
                out[f"{name}_avg_seconds"] = sum(samples) / len(samples)
                out[f"{name}_count"] = len(samples)
        return out
