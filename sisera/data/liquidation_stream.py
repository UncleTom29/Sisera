from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque
from collections.abc import Callable

import websocket

from sisera.data.models import LiquidationEvent

logger = logging.getLogger(__name__)

_WS_URL = "wss://stream.bybit.com/v5/public/linear"


def parse_liquidation_message(message: dict) -> list[LiquidationEvent]:
    """Parse one raw `allLiquidation.{symbol}` WebSocket message. See SCOPE.md §3, §5.

    Pulled out as a pure function so message parsing is testable without a real
    WebSocket connection — the thing actually worth verifying carefully here.
    """
    topic = message.get("topic", "")
    if not topic.startswith("allLiquidation."):
        return []
    return [
        LiquidationEvent(
            symbol=row["s"],
            side=row["S"],
            price=float(row["p"]),
            size=float(row["v"]),
            timestamp_ms=int(row["T"]),
        )
        for row in message.get("data", [])
    ]


class LiquidationStream:
    """Rolling buffer of recent forced liquidations per symbol, fed by Bybit's
    public `allLiquidation` WebSocket feed. See SCOPE.md §3, §5.

    The rest of the codebase is synchronous — this runs the WebSocket connection
    on a background thread so callers just query a rolling buffer, no async
    required anywhere else. `ingest()` is public specifically so tests (and any
    future replay/backfill use case) can feed events without a live connection.
    """

    def __init__(
        self,
        symbols: list[str],
        buffer_window_seconds: float = 300.0,
        ws_url: str | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._symbols = list(symbols)
        self._buffer_window_seconds = buffer_window_seconds
        self._ws_url = ws_url or _WS_URL
        self._clock = clock
        self._buffers: dict[str, deque[LiquidationEvent]] = {s: deque() for s in self._symbols}
        self._lock = threading.Lock()
        self._ws_app: websocket.WebSocketApp | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._ws_app = websocket.WebSocketApp(
            self._ws_url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
        )
        self._thread = threading.Thread(target=self._ws_app.run_forever, daemon=True)
        self._thread.start()
        logger.info("Liquidation stream starting for %s", self._symbols)

    def stop(self) -> None:
        if self._ws_app is not None:
            self._ws_app.close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _on_open(self, ws: websocket.WebSocketApp) -> None:
        topics = [f"allLiquidation.{s}" for s in self._symbols]
        ws.send(json.dumps({"op": "subscribe", "args": topics}))
        logger.info("Subscribed to liquidation feed: %s", topics)

    def _on_error(self, ws: websocket.WebSocketApp, error: Exception) -> None:
        logger.warning("Liquidation stream error: %s", error)

    def _on_message(self, ws: websocket.WebSocketApp, raw_message: str) -> None:
        try:
            message = json.loads(raw_message)
        except json.JSONDecodeError:
            logger.warning("Non-JSON liquidation stream message, dropped: %r", raw_message[:200])
            return
        for event in parse_liquidation_message(message):
            self.ingest(event)

    def ingest(self, event: LiquidationEvent) -> None:
        with self._lock:
            buffer = self._buffers.setdefault(event.symbol, deque())
            buffer.append(event)
            self._prune(event.symbol)

    def recent_events(self, symbol: str) -> list[LiquidationEvent]:
        with self._lock:
            self._prune(symbol)
            return list(self._buffers.get(symbol, ()))

    def _prune(self, symbol: str) -> None:
        buffer = self._buffers.get(symbol)
        if not buffer:
            return
        cutoff_ms = int(self._clock() * 1000) - int(self._buffer_window_seconds * 1000)
        while buffer and buffer[0].timestamp_ms < cutoff_ms:
            buffer.popleft()
