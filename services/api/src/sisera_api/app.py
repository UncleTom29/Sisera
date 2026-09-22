"""Sisera API service (spec §45).

Versioned (`/api/v1`) FastAPI over the canonical repositories. Mutating financial
endpoints accept idempotency via `client_order_id` (orders) and `entry_id` (ledger).
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, FastAPI, HTTPException, Request, WebSocket
from pydantic import BaseModel, ValidationError
from sisera_domain.order import InvalidStateTransition, Order, OrderSide, OrderState, OrderType

from sisera_api.auth import require_user


class CreateOrderRequest(BaseModel):
    client_order_id: str
    instrument_id: str
    side: OrderSide
    order_type: OrderType
    quantity: Decimal
    price: Decimal | None = None
    account_id: str
    portfolio_id: str
    user_id: str | None = None


class AdvanceOrderRequest(BaseModel):
    target: OrderState
    note: str | None = None


class CreateLedgerEntryRequest(BaseModel):
    entry_id: str
    entry_type: str
    timestamp_ms: int = 0
    postings: list[dict]
    reference_id: str | None = None


def create_app(
    order_repo_factory=None,
    ledger_repo_factory=None,
    decision_repo_factory=None,
    instrument_repo_factory=None,
    portfolio_repo_factory=None,
    verifier=None,
    hub=None,
) -> FastAPI:
    """Factory with injectable repository providers (callables returning a repository).

    Production wires these to Postgres sessions; tests inject SQLite-backed repositories.
    Mutating endpoints require a valid bearer token verified by `verifier`
    (real `PrivyVerifier` in production, mock in tests). Without a verifier, mutating
    endpoints return 501. `hub` is the realtime fan-out (shared in-memory default).
    """
    from sisera_api.ws import RealtimeHub

    app = FastAPI(title="Sisera API", version="1.0")
    realtime = hub or RealtimeHub()
    app.state.realtime = realtime

    v1 = APIRouter(prefix="/api/v1")

    @v1.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @v1.get("/instruments/{instrument_id}")
    def get_instrument(instrument_id: str) -> dict:
        repo = instrument_repo_factory()
        instrument = repo.get_instrument(instrument_id)
        if instrument is None:
            raise HTTPException(status_code=404, detail="Instrument not found")
        return instrument.model_dump(mode="json")

    @v1.post("/orders", status_code=201)
    def create_order(req: CreateOrderRequest, request: Request) -> dict:
        identity = require_user(request, verifier)
        repo = order_repo_factory()
        order = Order(
            sisera_order_id=f"sis_{req.client_order_id}",
            client_order_id=req.client_order_id,
            instrument_id=req.instrument_id,
            side=req.side,
            order_type=req.order_type,
            quantity=req.quantity,
            price=req.price,
            account_id=req.account_id,
            portfolio_id=req.portfolio_id,
            user_id=identity.user_id,
        )
        saved = repo.save(order)
        return saved.model_dump(mode="json")

    @v1.get("/orders/{sisera_order_id}")
    def get_order(sisera_order_id: str) -> dict:
        repo = order_repo_factory()
        order = repo.get(sisera_order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Order not found")
        return order.model_dump(mode="json")

    @v1.post("/orders/{sisera_order_id}/advance")
    def advance_order(sisera_order_id: str, req: AdvanceOrderRequest, request: Request) -> dict:
        require_user(request, verifier)
        repo = order_repo_factory()
        try:
            advanced = repo.advance(sisera_order_id, req.target, req.note)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Order not found") from exc
        except InvalidStateTransition as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return advanced.model_dump(mode="json")

    @v1.get("/ledger/balances")
    def ledger_balances(account: str) -> dict:
        repo = ledger_repo_factory()
        return {k: str(v) for k, v in repo.balances(account).items()}

    @v1.post("/ledger/entries", status_code=201)
    def post_ledger_entry(req: CreateLedgerEntryRequest, request: Request) -> dict:
        from sisera_domain.ledger import EntryType, LedgerEntry, Posting

        require_user(request, verifier)
        repo = ledger_repo_factory()
        try:
            entry = LedgerEntry(
                entry_id=req.entry_id,
                entry_type=EntryType(req.entry_type),
                timestamp_ms=req.timestamp_ms,
                reference_id=req.reference_id,
                postings=tuple(Posting(**p) for p in req.postings),
            )
        except (ValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        saved = repo.post(entry)
        return saved.model_dump(mode="json")

    @v1.get("/portfolios/{portfolio_id}")
    def get_portfolio(portfolio_id: str) -> dict:
        repo = portfolio_repo_factory()
        portfolio = repo.get_portfolio(portfolio_id)
        if portfolio is None:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return portfolio.model_dump(mode="json")

    app.include_router(v1)

    @app.websocket("/ws/v1/stream")
    async def realtime_stream(websocket: WebSocket) -> None:
        from fastapi import WebSocketDisconnect

        token = websocket.query_params.get("token", "")
        if verifier is None:
            await websocket.close(code=4401, reason="Auth not configured")
            return
        try:
            verified = verifier.verify(token)
            user_id = getattr(verified, "user_id", None)
            if not user_id:
                raise ValueError("no subject")
        except Exception:  # noqa: BLE001 - any verification failure closes as unauthorized
            await websocket.close(code=4401, reason="Invalid token")
            return
        await websocket.accept()
        realtime.connect(websocket)
        try:
            await realtime.send_hello(websocket)
            while True:
                message = await websocket.receive_text()
                if message == "ping":
                    await websocket.send_text("pong")
        except (WebSocketDisconnect, RuntimeError):
            realtime.disconnect(websocket)

    return app
