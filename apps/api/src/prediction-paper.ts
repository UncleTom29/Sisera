import type { PredictionPaperState } from "@sisera/db";
import Decimal from "decimal.js";

export class PredictionPaperRejection extends Error {}

export function settlePredictionPaperOrder(
  state: PredictionPaperState,
  order: { marketId: string; outcome: "yes" | "no"; depositUsd: string; priceUsd: string },
) {
  const deposit = new Decimal(order.depositUsd);
  const price = new Decimal(order.priceUsd);
  const cash = new Decimal(state.cashUsd);
  if (!deposit.isFinite() || deposit.lt(5) || deposit.gt(500))
    throw new PredictionPaperRejection("Paper prediction orders must be $5–$500.");
  if (!price.isFinite() || price.lte(0) || price.gte(1))
    throw new PredictionPaperRejection("A current outcome price below $1 is required.");
  if (cash.lt(deposit)) throw new PredictionPaperRejection("Insufficient paper USDC balance.");
  const fee = deposit.mul("0.005").toDecimalPlaces(6, Decimal.ROUND_UP);
  const contracts = deposit.minus(fee).div(price).toDecimalPlaces(6, Decimal.ROUND_DOWN);
  if (contracts.lte(0)) throw new PredictionPaperRejection("Order is too small at this price.");
  const key = `${order.marketId}:${order.outcome}`;
  const held = state.positions[key];
  return {
    state: {
      cashUsd: cash.minus(deposit).toString(),
      positions: {
        ...state.positions,
        [key]: {
          contracts: new Decimal(held?.contracts ?? "0").plus(contracts).toString(),
          costUsd: new Decimal(held?.costUsd ?? "0").plus(deposit).toString(),
        },
      },
    },
    contracts: contracts.toString(),
    feeUsd: fee.toString(),
  };
}
