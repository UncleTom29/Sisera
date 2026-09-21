"""FastAPI Application Factory for Sisera Web Interface. See SCOPE.md §14."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from sisera.config import config
from sisera.interfaces.web.routes import get_orchestrator
from sisera.interfaces.web.routes import router as api_router
from sisera.interfaces.web.routes import set_api_context
from sisera.ledger.ledger import DecisionLedger
from sisera.orchestrator import Orchestrator

logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"


class WebSocketManager:
    """Manages active WebSocket connections for live real-time dashboard updates."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:  # noqa: BLE001
                self.disconnect(connection)


ws_manager = WebSocketManager()


async def _live_stream_worker() -> None:
    """Fast real-time poller (2s) for live Bybit tickers and mark-to-market position updates."""
    logger.info("Live WebSocket streaming worker started (2s cadence).")
    while True:
        try:
            orch = get_orchestrator()
            # Fast monitor open positions
            if orch and orch.portfolio.open_positions:
                await asyncio.to_thread(orch.run_fast_position_monitor)
            await ws_manager.broadcast({"type": "POSITION_UPDATE"})
        except Exception as exc:  # noqa: BLE001
            logger.debug("Live stream worker error: %s", exc)
        await asyncio.sleep(2.0)


async def _periodic_scan_worker() -> None:
    """Background periodic scanner (60s) across universe."""
    logger.info("Periodic background universe scanner started (60s cadence).")
    await asyncio.sleep(5.0)  # initial delay
    while True:
        try:
            orch = get_orchestrator()
            if orch:
                await asyncio.to_thread(orch.run_scan_cycle, ["1h", "4h"], 20)
                await ws_manager.broadcast({"type": "SCAN_COMPLETE"})
        except Exception as exc:  # noqa: BLE001
            logger.warning("Periodic scan worker error: %s", exc)
        await asyncio.sleep(60.0)


async def _news_monitor_worker() -> None:
    """Background breaking-news scanner (config.news_monitor_interval_seconds, default
    180s cadence). Was previously defined on Orchestrator but never actually scheduled
    anywhere -- run_news_monitor_cycle() only ever ran inside tests, never in the live
    app. No-ops immediately (cheap, just an attribute check) when the feature is off."""
    logger.info(
        "News monitor background worker started (%ds cadence).",
        config.news_monitor_interval_seconds,
    )
    await asyncio.sleep(10.0)  # initial delay
    while True:
        try:
            orch = get_orchestrator()
            if orch and orch.news_enabled:
                significant = await asyncio.to_thread(orch.run_news_monitor_cycle)
                if significant:
                    await ws_manager.broadcast({"type": "NEWS_EVENT", "count": significant})
        except Exception as exc:  # noqa: BLE001
            logger.warning("News monitor worker error: %s", exc)
        await asyncio.sleep(config.news_monitor_interval_seconds)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Start live background streams
    stream_task = asyncio.create_task(_live_stream_worker())
    scan_task = asyncio.create_task(_periodic_scan_worker())
    news_task = asyncio.create_task(_news_monitor_worker())
    try:
        yield
    finally:
        stream_task.cancel()
        scan_task.cancel()
        news_task.cancel()


def create_app(
    orchestrator: Orchestrator | None = None,
    ledger: DecisionLedger | None = None,
) -> FastAPI:
    """Factory creating configured FastAPI app for Sisera."""
    set_api_context(orchestrator, ledger)

    app = FastAPI(
        title="Sisera Quantitative Trading Bot",
        description="Derivatives-native crypto trading intelligence dashboard & API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(api_router)

    # WebSocket route for real-time streaming
    @app.websocket("/ws/live")
    async def websocket_endpoint(websocket: WebSocket) -> None:
        await ws_manager.connect(websocket)
        try:
            while True:
                # Keepalive / ping reception
                data = await websocket.receive_text()
                # Respond to ping
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)
        except Exception:  # noqa: BLE001
            ws_manager.disconnect(websocket)

    # Static assets and index.html
    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

        @app.get("/favicon.ico", include_in_schema=False)
        async def favicon() -> Response:
            return Response(status_code=204)

        @app.get("/")
        async def serve_index() -> FileResponse:
            index_path = STATIC_DIR / "index.html"
            return FileResponse(str(index_path))

    return app
