"""Tests for observability primitives (spec §47)."""

from __future__ import annotations

import json
import logging

from sisera_observability import (
    Metrics,
    get_correlation_id,
    get_logger,
    new_correlation_id,
    set_correlation_id,
)


def test_correlation_id_round_trip() -> None:
    cid = new_correlation_id()
    assert get_correlation_id() == cid
    set_correlation_id("abc")
    assert get_correlation_id() == "abc"


def test_json_logger_emits_correlation_id(caplog) -> None:
    set_correlation_id("test-cid")
    logger = get_logger("sisera.test")
    with caplog.at_level(logging.INFO, logger="sisera.test"):
        logger.info("hello")
    assert len(caplog.records) == 1
    formatted = logger.handlers[0].formatter.format(caplog.records[0])
    payload = json.loads(formatted)
    assert payload["correlation_id"] == "test-cid"
    assert payload["message"] == "hello"


def test_metrics_counters_and_latencies() -> None:
    m = Metrics()
    m.increment("order_submission")
    m.increment("order_submission")
    m.observe_latency("order_submission_latency", 0.05)
    m.observe_latency("order_submission_latency", 0.15)
    assert m.count("order_submission") == 2
    assert m.avg_latency("order_submission_latency") == 0.1
    snap = m.snapshot()
    assert snap["order_submission"] == 2
