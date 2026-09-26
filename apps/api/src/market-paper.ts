import type { MarketPaperState } from "@sisera/db";
import Decimal from "decimal.js";

export class PaperOrderRejection extends Error {}

export function settleMarketPaperOrder(
  state: MarketPaperState,
  order: {
    venue: "binance" | "hyperliquid";
    symbol: string;
    baseAsset: string;
    side: "buy" | "sell";
    quantity: string;
    fillPrice: string;
  },
): { state: MarketPaperState; feeUsd: string } {
  const quantity = new Decimal(order.quantity);
  const price = new Decimal(order.fillPrice);
  const notional = quantity.mul(price);
  if (!quantity.isFinite() || !quantity.gt(0) || !price.isFinite() || !price.gt(0))
    throw new PaperOrderRejection("Quantity and price must be positive.");
  if (notional.lt(5) || notional.gt(2500))
    throw new PaperOrderRejection("Paper orders must be between $5 and $2,500.");
  const fee = notional.mul(order.venue === "binance" ? "0.001" : "0.0005");
  let cash = new Decimal(state.cashUsd);
  const spotHoldings = { ...state.spotHoldings };
  const perpPositions = { ...state.perpPositions };

  if (order.venue === "binance") {
    const held = new Decimal(spotHoldings[order.baseAsset] ?? "0");
    if (order.side === "buy") {
      if (cash.lt(notional.plus(fee)))
        throw new PaperOrderRejection("Insufficient paper USDT balance.");
      cash = cash.minus(notional).minus(fee);
      spotHoldings[order.baseAsset] = held.plus(quantity).toString();
    } else {
      if (held.lt(quantity)) throw new PaperOrderRejection("Insufficient paper spot holdings.");
      cash = cash.plus(notional).minus(fee);
      spotHoldings[order.baseAsset] = held.minus(quantity).toString();
    }
  } else {
    const existing = perpPositions[order.symbol];
    const prior = new Decimal(existing?.size ?? "0");
    const delta = order.side === "buy" ? quantity : quantity.neg();
    const next = prior.plus(delta);
    if (prior.isZero() || prior.isPositive() === delta.isPositive()) {
      const oldNotional = prior.abs().mul(existing?.entryPrice ?? "0");
      const entry = oldNotional.plus(notional).div(next.abs());
      perpPositions[order.symbol] = { size: next.toString(), entryPrice: entry.toString() };
    } else {
      const closed = Decimal.min(prior.abs(), delta.abs());
      cash = cash.plus(
        closed.mul(price.minus(existing?.entryPrice ?? "0")).mul(prior.isPositive() ? 1 : -1),
      );
      if (next.isZero()) delete perpPositions[order.symbol];
      else
        perpPositions[order.symbol] = {
          size: next.toString(),
          entryPrice:
            prior.isPositive() === next.isPositive()
              ? String(existing?.entryPrice)
              : price.toString(),
        };
    }
    cash = cash.minus(fee);
    const grossExposure = Object.values(perpPositions).reduce(
      (sum, position) => sum.plus(new Decimal(position.size).abs().mul(position.entryPrice)),
      new Decimal(0),
    );
    if (cash.lte(0) || grossExposure.gt(cash))
      throw new PaperOrderRejection(
        "Paper perp exposure cannot exceed paper equity (1× maximum). ",
      );
  }
  return {
    state: { cashUsd: cash.toString(), spotHoldings, perpPositions },
    feeUsd: fee.toString(),
  };
}
