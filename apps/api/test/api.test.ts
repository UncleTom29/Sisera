import type { Instrument, MarketSnapshot } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { readConfig } from "../src/config.js";

const instrument: Instrument = {
  id: "binance:BTCUSDT:spot",
  venue: "binance",
  venueSymbol: "BTCUSDT",
  displaySymbol: "BTC / USDT",
  assetClass: "crypto",
  type: "spot",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  priceIncrement: "0.01",
  quantityIncrement: "0.00001",
  contractMultiplier: "1",
  status: "active",
};

describe("control plane API", () => {
  it("requires authorization for market data", async () => {
    const app = await buildApi(readConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    const response = await app.inject({ method: "GET", url: "/v1/markets/BTCUSDT" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("serves provider data without synthetic fallback", async () => {
    const now = new Date().toISOString();
    const snapshot: MarketSnapshot = {
      instrumentId: instrument.id,
      bid: "60000",
      ask: "60001",
      last: "60000.5",
      quality: {
        status: "live",
        source: "test-provider",
        observedAt: now,
        receivedAt: now,
        latencyMs: 1,
      },
    };
    const app = await buildApi(
      readConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", SISERA_ALLOW_DEV_AUTH: "true" }),
      { marketData: { getInstrument: async () => instrument, getSnapshot: async () => snapshot } },
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/markets/BTCUSDT",
      headers: { "x-sisera-dev-role": "viewer" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().snapshot.quality.source).toBe("test-provider");
    await app.close();
  });
});
