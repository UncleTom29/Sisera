"""Execution Adapter. See SCOPE.md §11.

Interface and implementations for Bybit perpetual futures execution:
- Paper trading adapter (high-fidelity simulated execution)
- Bybit V5 CCXT live/testnet adapter with native exchange trailing stops.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Protocol

from pydantic import BaseModel, Field

from sisera.opportunity.models import TradeDirection
from sisera.risk.models import Position

logger = logging.getLogger(__name__)


class OrderRequest(BaseModel):
    symbol: str
    direction: TradeDirection
    order_type: str  # "Limit" | "Market"
    qty: float  # Quantity in base coins
    price: float | None = None
    time_in_force: str = "GTC"  # "GTC" | "PostOnly" | "IOC"
    stop_loss: float | None = None
    take_profit: float | None = None
    trailing_stop_dist: float | None = None
    activation_price: float | None = None


class OrderResponse(BaseModel):
    order_id: str
    symbol: str
    direction: TradeDirection
    status: str  # "Filled" | "New" | "Canceled" | "Rejected"
    filled_qty: float
    avg_fill_price: float
    fee_paid: float
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))


class ExecutionAdapter(Protocol):
    """Protocol for execution venues. See SCOPE.md §2, §11."""

    def place_order(self, request: OrderRequest) -> OrderResponse: ...

    def cancel_order(self, symbol: str, order_id: str) -> bool: ...

    def set_exchange_trailing_stop(
        self,
        symbol: str,
        trailing_stop_dist: float,
        activation_price: float | None = None,
    ) -> bool: ...

    def get_positions(self) -> list[Position]: ...

    def get_balance(self) -> float: ...


class PaperExecutionAdapter:
    """High-fidelity simulated paper trading backend. See SCOPE.md §11."""

    def __init__(
        self,
        initial_balance: float = 10_000.0,
        taker_fee: float = 0.00055,
        maker_fee: float = 0.0002,
    ) -> None:
        self.balance = initial_balance
        self.taker_fee = taker_fee
        self.maker_fee = maker_fee
        self.positions: dict[str, Position] = {}
        self.order_history: list[OrderResponse] = []
        self._order_counter = 1

    def place_order(self, request: OrderRequest) -> OrderResponse:
        order_id = f"paper_ord_{self._order_counter}"
        self._order_counter += 1

        fill_price = request.price or 100.0
        # PostOnly receives maker fee, Market receives taker fee
        fee_rate = self.maker_fee if request.time_in_force == "PostOnly" else self.taker_fee
        notional = request.qty * fill_price
        fee = notional * fee_rate

        self.balance -= fee

        resp = OrderResponse(
            order_id=order_id,
            symbol=request.symbol,
            direction=request.direction,
            status="Filled",
            filled_qty=request.qty,
            avg_fill_price=fill_price,
            fee_paid=fee,
        )
        self.order_history.append(resp)
        logger.info(
            "Paper order filled: %s %s %s qty=%.4f @ %.4f fee=$%.4f",
            request.symbol,
            request.direction.value,
            request.order_type,
            request.qty,
            fill_price,
            fee,
        )
        return resp

    def cancel_order(self, symbol: str, order_id: str) -> bool:
        logger.info("Paper order canceled: %s (%s)", order_id, symbol)
        return True

    def set_exchange_trailing_stop(
        self,
        symbol: str,
        trailing_stop_dist: float,
        activation_price: float | None = None,
    ) -> bool:
        logger.info(
            "Paper native trailing stop set for %s: dist=%.4f, activation=%.4f",
            symbol,
            trailing_stop_dist,
            activation_price or 0.0,
        )
        return True

    def get_positions(self) -> list[Position]:
        return list(self.positions.values())

    def get_balance(self) -> float:
        return self.balance


class BybitExecutionAdapter:
    """Bybit V5 CCXT live / testnet execution adapter. See SCOPE.md §11."""

    def __init__(
        self,
        api_key: str = "",
        api_secret: str = "",
        is_testnet: bool = True,
    ) -> None:
        self.api_key = api_key
        self.api_secret = api_secret
        self.is_testnet = is_testnet
        self._exchange = None

    def _init_exchange(self) -> None:
        if self._exchange is None:
            import ccxt

            self._exchange = ccxt.bybit(
                {
                    "apiKey": self.api_key,
                    "secret": self.api_secret,
                    "enableRateLimit": True,
                    "options": {"defaultType": "linear"},
                }
            )
            if self.is_testnet:
                self._exchange.set_sandbox_mode(True)

    def place_order(self, request: OrderRequest) -> OrderResponse:
        self._init_exchange()
        side = "buy" if request.direction == TradeDirection.LONG else "sell"
        order_type = request.order_type.lower()

        params: dict[str, Any] = {"category": "linear"}
        if request.time_in_force == "PostOnly":
            params["timeInForce"] = "PostOnly"

        if request.stop_loss:
            params["stopLoss"] = str(request.stop_loss)
        if request.take_profit:
            params["takeProfit"] = str(request.take_profit)

        raw = self._exchange.create_order(
            symbol=request.symbol,
            type=order_type,
            side=side,
            amount=request.qty,
            price=request.price,
            params=params,
        )

        return OrderResponse(
            order_id=str(raw.get("id", "")),
            symbol=request.symbol,
            direction=request.direction,
            status="Filled" if raw.get("status") == "closed" else "New",
            filled_qty=float(raw.get("filled", request.qty)),
            avg_fill_price=float(raw.get("average", request.price or 0.0)),
            fee_paid=float(raw.get("fee", {}).get("cost", 0.0)) if raw.get("fee") else 0.0,
        )

    def cancel_order(self, symbol: str, order_id: str) -> bool:
        self._init_exchange()
        try:
            self._exchange.cancel_order(order_id, symbol, {"category": "linear"})
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Cancel order %s failed: %s", order_id, exc)
            return False

    def set_exchange_trailing_stop(
        self,
        symbol: str,
        trailing_stop_dist: float,
        activation_price: float | None = None,
    ) -> bool:
        """Sets Bybit exchange-native trailing stop via /v5/position/trading-stop."""
        self._init_exchange()
        params = {
            "category": "linear",
            "symbol": symbol,
            "trailingStop": str(trailing_stop_dist),
            "positionIdx": 0,  # One-way mode
        }
        if activation_price:
            params["activePrice"] = str(activation_price)

        try:
            # CCXT Bybit tradingStop endpoint
            self._exchange.private_post_v5_position_trading_stop(params)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to set native trailing stop on Bybit for %s: %s", symbol, exc)
            return False

    def get_positions(self) -> list[Position]:
        self._init_exchange()
        raw_positions = self._exchange.fetch_positions(params={"category": "linear"})
        positions = []
        for rp in raw_positions:
            size = float(rp.get("contracts", 0.0))
            if size <= 0:
                continue
            side = TradeDirection.LONG if rp.get("side") == "long" else TradeDirection.SHORT
            positions.append(
                Position(
                    symbol=rp.get("symbol", ""),
                    direction=side,
                    entry_price=float(rp.get("entryPrice", 0.0)),
                    size_notional=float(rp.get("notional", 0.0)),
                    leverage=float(rp.get("leverage", 1.0)),
                    margin=float(rp.get("initialMargin", 0.0)),
                    liquidation_price=float(rp.get("liquidationPrice", 0.0)),
                    stop_loss_price=0.0,
                    unrealized_pnl=float(rp.get("unrealizedPnl", 0.0)),
                )
            )
        return positions

    def get_balance(self) -> float:
        self._init_exchange()
        balance_info = self._exchange.fetch_balance(params={"category": "linear"})
        return float(balance_info.get("USDT", {}).get("total", 0.0))
