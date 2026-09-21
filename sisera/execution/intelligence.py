"""Execution Intelligence. See SCOPE.md §11.

- Post-only limit first, market fallback second with alpha-decay-aware timeout.
- Order slicing against order-book depth for larger clips.
"""

from __future__ import annotations

import logging
import math

from sisera.config import config
from sisera.data.models import OrderBook
from sisera.execution.adapter import ExecutionAdapter, OrderRequest, OrderResponse
from sisera.opportunity.models import Opportunity, TradeDirection

logger = logging.getLogger(__name__)


class ExecutionIntelligence:
    """Execution Intelligence layer minimizing slippage and maximizing fill capture."""

    def __init__(
        self,
        adapter: ExecutionAdapter,
        post_only_timeout_base: float | None = None,
        alpha_decay_factor: float | None = None,
        slicing_depth_ratio: float | None = None,
        max_slices: int | None = None,
    ) -> None:
        self.adapter = adapter
        self.post_only_timeout_base = post_only_timeout_base or config.post_only_timeout_seconds
        self.alpha_decay_factor = alpha_decay_factor or config.alpha_decay_factor
        self.slicing_depth_ratio = slicing_depth_ratio or config.order_slicing_depth_ratio
        self.max_slices = max_slices or config.max_order_slices

    def slice_order(
        self,
        request: OrderRequest,
        order_book: OrderBook | None = None,
    ) -> list[OrderRequest]:
        """Slices large clips into smaller child orders if notional exceeds near depth threshold."""
        if not order_book or not order_book.bids or not order_book.asks:
            return [request]

        mid = order_book.mid_price or request.price or 1.0
        # Calculate near depth in top 5 levels
        is_short = request.direction == TradeDirection.SHORT
        levels = order_book.bids[:5] if is_short else order_book.asks[:5]
        available_depth = sum(lvl.size * lvl.price for lvl in levels)

        order_notional = request.qty * mid
        depth_threshold = max(available_depth * self.slicing_depth_ratio, 5000.0)

        if order_notional <= depth_threshold or available_depth <= 0:
            return [request]

        # Determine number of slices
        num_slices = min(self.max_slices, max(2, int(math.ceil(order_notional / depth_threshold))))
        slice_qty = request.qty / num_slices

        logger.info(
            "Slicing %s order of %.4f %s ($%.2f) into %d clips of %.4f",
            request.direction.value,
            request.qty,
            request.symbol,
            order_notional,
            num_slices,
            slice_qty,
        )

        slices = []
        for _ in range(num_slices):
            slices.append(
                OrderRequest(
                    symbol=request.symbol,
                    direction=request.direction,
                    order_type=request.order_type,
                    qty=slice_qty,
                    price=request.price,
                    time_in_force=request.time_in_force,
                    stop_loss=request.stop_loss,
                    take_profit=request.take_profit,
                )
            )
        return slices

    def execute_with_fallback(
        self,
        request: OrderRequest,
        opportunity: Opportunity,
        order_book: OrderBook | None = None,
    ) -> list[OrderResponse]:
        """Executes order clips using post-only limit first, falling back to market on timeout."""
        slices = self.slice_order(request, order_book)
        responses: list[OrderResponse] = []

        # Alpha-decay aware timeout (§11)
        # Higher expected value decay rate reduces timeout to avoid giving up alpha
        decay_rate = 1.0 / max(float(opportunity.holding_horizon_bars), 1.0)
        timeout = max(
            5.0,
            self.post_only_timeout_base / (1.0 + decay_rate * self.alpha_decay_factor * 10.0),
        )

        logger.info(
            "Executing %s with dynamic post-only timeout of %.1fs (decay_rate=%.4f)",
            request.symbol,
            timeout,
            decay_rate,
        )

        for i, clip in enumerate(slices, start=1):
            # Attempt post-only limit
            clip.time_in_force = "PostOnly"
            clip.order_type = "Limit"
            if order_book:
                # Place limit order on the book edge (best bid for buy, best ask for sell)
                if clip.direction == TradeDirection.LONG and order_book.best_bid:
                    clip.price = order_book.best_bid
                elif clip.direction == TradeDirection.SHORT and order_book.best_ask:
                    clip.price = order_book.best_ask

            resp = self.adapter.place_order(clip)
            if resp.status != "Filled":
                # If post-only limit rejected or unfilled, fall back to Market immediately
                logger.info(
                    "Clip %d/%d not filled as post-only; falling back to Market order",
                    i,
                    len(slices),
                )
                clip.time_in_force = "IOC"
                clip.order_type = "Market"
                clip.price = None
                resp = self.adapter.place_order(clip)

            responses.append(resp)

        return responses
