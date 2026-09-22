"""Sisera API service (spec §45).

Versioned (`/api/v1`) FastAPI over the canonical repositories. Mutating financial
endpoints accept idempotency via `client_order_id` (orders) and `entry_id` (ledger).
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, FastAPI, HTTPException
from pydantic import BaseModel, ValidationError
from sisera_domain.order import InvalidStateTransition, Order, OrderSide, OrderState, OrderType


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
) -> FastAPI:
    """Factory with injectable repository providers (callables returning a repository).

    Production wires these to Postgres sessions; tests inject SQLite-backed repositories.
    """
    app = FastAPI(title="Sisera API", version="1.0")

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
    def create_order(req: CreateOrderRequest) -> dict:
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
            user_id=req.user_id,
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
    def advance_order(sisera_order_id: str, req: AdvanceOrderRequest) -> dict:
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
    def post_ledger_entry(req: CreateLedgerEntryRequest) -> dict:
        from sisera_domain.ledger import EntryType, LedgerEntry, Posting

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
    return app
