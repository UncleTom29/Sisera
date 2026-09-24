import type {
  Instrument,
  MarketSnapshot,
  OrderIntent,
  PortfolioRiskState,
  RiskLimits,
} from "@sisera/domain";
import { describe, expect, it } from "vitest";
import { evaluatePreTradeRisk } from "../src/index.js";

const instrument: Instrument = {
  id: "binance:BTCUSDT:spot",
  venue: "binance",
  venueSymbol: "BTCUSDT",
  displaySymbol: "BTC / USD",
  assetClass: "crypto",
  type: "spot",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceIncrement: "0.01",
  quantityIncrement: "0.00001",
  contractMultiplier: "1",
  status: "active",
};
const order: OrderIntent = {
  clientOrderId: "client-001",
  portfolioId: "portfolio-1",
  accountId: "paper-main",
  instrumentId: instrument.id,
  side: "buy",
  type: "market",
  quantity: "0.1",
  timeInForce: "gtc",
  reduceOnly: false,
  mode: "paper",
  submittedBy: "user-1",
  correlationId: "corr-0001",
};
const portfolio: PortfolioRiskState = {
  nav: "100000",
  grossExposure: "10000",
  netExposure: "10000",
  dailyPnl: "-200",
  existingInstrumentExposure: "0",
};
const limits: RiskLimits = {
  maxOrderNotional: "10000",
  maxGrossExposure: "100000",
  maxNetExposure: "50000",
  maxPositionNotional: "25000",
  maxDailyLoss: "5000",
  maxLeverage: "2",
  maxQuoteAgeMs: 2000,
  allowedAssetClasses: ["crypto"],
};

function quote(observedAt: string): MarketSnapshot {
  return {
    instrumentId: instrument.id,
    bid: "59999",
    ask: "60000",
    last: "60000",
    quality: {
      status: "live",
      source: "binance",
      observedAt,
      receivedAt: observedAt,
      latencyMs: 20,
    },
  };
}

describe("pre-trade risk", () => {
  it("approves an order inside every mandate", () => {
    const now = new Date("2026-01-01T00:00:01.000Z");
    const decision = evaluatePreTradeRisk({
      order,
      instrument,
      quote: quote("2026-01-01T00:00:00.500Z"),
      portfolio,
      limits,
      now,
    });
    expect(decision.outcome).toBe("approved");
    expect(decision.orderNotional).toBe("6000");
  });

  it("rejects stale prices before paper execution", () => {
    const decision = evaluatePreTradeRisk({
      order,
      instrument,
      quote: quote("2026-01-01T00:00:00.000Z"),
      portfolio,
      limits,
      now: new Date("2026-01-01T00:00:05.000Z"),
    });
    expect(decision.outcome).toBe("rejected");
    expect(decision.reasons.map((reason) => reason.code)).toContain("QUOTE_STALE");
  });
});
