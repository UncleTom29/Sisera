import { z } from "zod";
import { TradeRejection } from "./solana-trading.js";

const Market = z.object({
  marketId: z.string(),
  status: z.string(),
  rulesPrimary: z.string().optional(),
  pricing: z.object({ buyYesPriceUsd: z.number(), buyNoPriceUsd: z.number() }),
});
const TradingStatus = z.object({ trading_active: z.boolean() });
const PreparedOrder = z.object({
  transaction: z.string().min(40),
  order: z.object({ orderPubkey: z.string().min(32) }),
});
type Fetcher = typeof globalThis.fetch;

export class JupiterPredictionTradingClient {
  constructor(
    private readonly baseUrl = "https://api.jup.ag/prediction/v1",
    private readonly apiKey?: string,
    private readonly fetcher: Fetcher = globalThis.fetch,
  ) {}

  async prepare(input: {
    marketId: string;
    wallet: string;
    isYes: boolean;
    depositAmount: string;
  }) {
    const [marketResponse, statusResponse] = await Promise.all([
      this.fetcher(`${this.baseUrl}/markets/${encodeURIComponent(input.marketId)}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(7000),
      }),
      this.fetcher(`${this.baseUrl}/trading-status`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(7000),
      }),
    ]);
    if (!marketResponse.ok || !statusResponse.ok)
      throw new TradeRejection("Jupiter prediction market is unavailable.", 503);
    const market = Market.parse(await marketResponse.json());
    const trading = TradingStatus.parse(await statusResponse.json());
    if (market.marketId !== input.marketId || market.status !== "open" || !trading.trading_active)
      throw new TradeRejection("This prediction market is not open for trading.");
    if (!market.rulesPrimary?.trim()) throw new TradeRejection("Resolution rules are unavailable.");
    const price = input.isYes ? market.pricing.buyYesPriceUsd : market.pricing.buyNoPriceUsd;
    if (!Number.isFinite(price) || price <= 0 || price >= 1_000_000)
      throw new TradeRejection("This outcome has no valid current buy price.");
    const response = await this.fetcher(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({
        ownerPubkey: input.wallet,
        marketId: input.marketId,
        isYes: input.isYes,
        isBuy: true,
        depositAmount: input.depositAmount,
        depositMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new TradeRejection(
        "Jupiter could not build this prediction order.",
        response.status === 429 ? 503 : 422,
      );
    const order = PreparedOrder.safeParse(await response.json());
    if (!order.success)
      throw new TradeRejection("Jupiter returned an incomplete prediction order.", 503);
    return { ...order.data, priceUsd: price / 1_000_000 };
  }

  async orderStatus(orderPubkey: string): Promise<string | null> {
    const response = await this.fetcher(
      `${this.baseUrl}/orders/status/${encodeURIComponent(orderPubkey)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) return null;
    const payload = z.object({ status: z.string() }).safeParse(await response.json());
    return payload.success ? payload.data.status : null;
  }

  private headers(): Record<string, string> {
    return { accept: "application/json", ...(this.apiKey ? { "x-api-key": this.apiKey } : {}) };
  }
}
