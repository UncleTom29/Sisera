import type {
  Instrument,
  MarketSnapshot,
  OrderIntent,
  PortfolioRiskState,
  RiskDecision,
  RiskLimits,
} from "@sisera/domain";
import Decimal from "decimal.js";

type PreTradeInput = {
  order: OrderIntent;
  instrument: Instrument;
  quote: MarketSnapshot;
  portfolio: PortfolioRiskState;
  limits: RiskLimits;
  now?: Date;
};

export function evaluatePreTradeRisk(input: PreTradeInput): RiskDecision {
  const now = input.now ?? new Date();
  const reasons: RiskDecision["reasons"] = [];
  const price = new Decimal(
    input.order.type === "market"
      ? input.order.side === "buy"
        ? input.quote.ask
        : input.quote.bid
      : (input.order.limitPrice ?? "0"),
  );
  const orderNotional = price.mul(input.order.quantity).mul(input.instrument.contractMultiplier);
  const signedNotional = input.order.side === "buy" ? orderNotional : orderNotional.negated();
  const projectedGross = new Decimal(input.portfolio.grossExposure).add(orderNotional.abs());
  const projectedNet = new Decimal(input.portfolio.netExposure).add(signedNotional);
  const projectedPosition = new Decimal(input.portfolio.existingInstrumentExposure).add(
    signedNotional,
  );
  const quoteAgeMs = now.getTime() - Date.parse(input.quote.quality.observedAt);

  if (input.order.mode === "live" && input.quote.quality.status !== "live") {
    reasons.push({ code: "QUOTE_NOT_LIVE", message: "Execution requires a live market quote." });
  }
  if (quoteAgeMs < 0 || quoteAgeMs > input.limits.maxQuoteAgeMs) {
    reasons.push({
      code: "QUOTE_STALE",
      message: "Quote age exceeds the configured execution threshold.",
      actual: String(Math.max(quoteAgeMs, 0)),
      limit: String(input.limits.maxQuoteAgeMs),
    });
  }
  if (!input.limits.allowedAssetClasses.includes(input.instrument.assetClass)) {
    reasons.push({ code: "ASSET_CLASS_BLOCKED", message: "Asset class is outside this mandate." });
  }
  checkLimit(reasons, "ORDER_NOTIONAL", orderNotional.abs(), input.limits.maxOrderNotional);
  checkLimit(reasons, "GROSS_EXPOSURE", projectedGross, input.limits.maxGrossExposure);
  checkLimit(reasons, "NET_EXPOSURE", projectedNet.abs(), input.limits.maxNetExposure);
  checkLimit(
    reasons,
    "POSITION_NOTIONAL",
    projectedPosition.abs(),
    input.limits.maxPositionNotional,
  );

  const dailyLoss = Decimal.min(new Decimal(input.portfolio.dailyPnl), 0).abs();
  checkLimit(reasons, "DAILY_LOSS", dailyLoss, input.limits.maxDailyLoss);

  const leverage = new Decimal(input.portfolio.nav).isZero()
    ? new Decimal(Number.POSITIVE_INFINITY)
    : projectedGross.div(input.portfolio.nav);
  checkLimit(reasons, "LEVERAGE", leverage, input.limits.maxLeverage);

  return {
    outcome: reasons.length === 0 ? "approved" : "rejected",
    checkedAt: now.toISOString(),
    orderNotional: orderNotional.toFixed(),
    projectedGrossExposure: projectedGross.toFixed(),
    projectedNetExposure: projectedNet.toFixed(),
    reasons,
  };
}

function checkLimit(
  reasons: RiskDecision["reasons"],
  code: string,
  actual: Decimal,
  limit: string,
): void {
  if (actual.greaterThan(new Decimal(limit))) {
    reasons.push({
      code: `${code}_LIMIT`,
      message: `${code.toLowerCase().replaceAll("_", " ")} exceeds its configured limit.`,
      actual: actual.toFixed(),
      limit,
    });
  }
}
