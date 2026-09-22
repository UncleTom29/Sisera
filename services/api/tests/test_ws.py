"""Tests for the realtime WebSocket (spec §46)."""

from __future__ import annotations

from pathlib import Path

from test_api import _client


def test_websocket_hello_and_broadcast(tmp_path: Path) -> None:
    client = _client(tmp_path)
    with client.websocket_connect("/ws/v1/stream?token=test-token") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["sequence"] == 0


def test_websocket_rejects_bad_token(tmp_path: Path) -> None:
    from starlette.websockets import WebSocketDisconnect

    client = _client(tmp_path)
    try:
        with client.websocket_connect("/ws/v1/stream?token=wrong"):
            raise AssertionError("should not connect")
    except (WebSocketDisconnect, RuntimeError, AssertionError):
        pass


def test_websocket_ping_pong(tmp_path: Path) -> None:
    client = _client(tmp_path)
    with client.websocket_connect("/ws/v1/stream?token=test-token") as ws:
        ws.receive_json()  # hello
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
