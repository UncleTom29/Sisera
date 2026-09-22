"""Realtime WebSocket fan-out (spec §46).

Authenticated `/ws/v1/stream` with per-connection sequence numbers, heartbeat, and
channel broadcast. The verifier is injected (Privy in production, mock in tests).
Browsers cannot set headers on WebSocket handshakes, so the token arrives as
`?token=` and is verified identically to the HTTP bearer path.
"""

from __future__ import annotations

import time

from fastapi import WebSocket, WebSocketDisconnect


class RealtimeHub:
    """In-memory pub/sub. A durable NATS-backed hub replaces this in production
    (ADR-003); the sequence/channel contract is unchanged."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, int] = {}

    def connect(self, websocket: WebSocket) -> None:
        self._connections[websocket] = 0

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    async def send_hello(self, websocket: WebSocket) -> None:
        await websocket.send_json(
            {"type": "hello", "sequence": 0, "server_time_ms": int(time.time() * 1000)}
        )

    async def broadcast(self, channel: str, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws, seq in list(self._connections.items()):
            seq += 1
            try:
                await ws.send_json(
                    {"type": "event", "channel": channel, "sequence": seq, "data": payload}
                )
                self._connections[ws] = seq
            except (WebSocketDisconnect, RuntimeError):
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)
