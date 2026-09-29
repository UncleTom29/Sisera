import { z } from "zod";

const JupiterPrice = z.record(
  z.string(),
  z
    .object({
      usdPrice: z.number(),
      priceChange24h: z.number().nullable().optional(),
      stockData: z.object({ price: z.number().nullable().optional() }).nullable().optional(),
    })
    .nullable(),
);

export type LivePrice = {
  usd: number;
  change24hPct: number | null;
  /** The issuer's underlying share price, when the token tracks a listed stock. */
  underlyingUsd: number | null;
  at: number;
};

/**
 * Keeps one shared snapshot of Solana token prices fresh to the second.
 *
 * The web tier polls this every second for every open terminal, so upstream work must not scale
 * with viewers: the hub refreshes on its own timer, only while someone has asked in the last 30
 * seconds, and answers every request from memory. The most-traded tokens refresh every tick; the
 * long tail rotates through the remaining capacity.
 */
export class LivePriceHub {
  private readonly prices = new Map<string, LivePrice>();
  private priority: string[] = [];
  private tail: string[] = [];
  private tailCursor = 0;
  private lastDemand = 0;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    private readonly loadUniverse: () => Promise<{ priority: string[]; tail: string[] }>,
    private readonly apiKey?: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly batchesPerTick = 3,
  ) {}

  /** Returns the latest prices for the requested mints, or every tracked mint. */
  snapshot(mints?: string[]) {
    this.lastDemand = Date.now();
    this.start();
    const entries = mints
      ? mints.flatMap((mint) => {
          const price = this.prices.get(mint);
          return price ? [[mint, price] as const] : [];
        })
      : [...this.prices.entries()];
    return Object.fromEntries(entries);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private start() {
    if (this.timer) return;
    void this.refreshUniverse();
    void this.tick();
    this.timer = setInterval(() => {
      if (Date.now() - this.lastDemand > 30_000) return this.stop();
      void this.tick();
    }, 1000);
    this.timer.unref?.();
  }

  private universeLoadedAt = 0;
  private async refreshUniverse() {
    if (Date.now() - this.universeLoadedAt < 60_000) return;
    this.universeLoadedAt = Date.now();
    try {
      const universe = await this.loadUniverse();
      this.priority = universe.priority;
      this.tail = universe.tail;
    } catch {
      this.universeLoadedAt = 0;
    }
  }

  private async tick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      void this.refreshUniverse();
      const batches: string[][] = [];
      for (
        let index = 0;
        index < this.priority.length && batches.length < this.batchesPerTick;
        index += 50
      )
        batches.push(this.priority.slice(index, index + 50));
      while (batches.length < this.batchesPerTick && this.tail.length) {
        const batch = this.tail.slice(this.tailCursor, this.tailCursor + 50);
        this.tailCursor = this.tailCursor + 50 >= this.tail.length ? 0 : this.tailCursor + 50;
        if (!batch.length) break;
        batches.push(batch);
      }
      await Promise.allSettled(batches.map((batch) => this.fetchBatch(batch)));
    } finally {
      this.inFlight = false;
    }
  }

  private async fetchBatch(mints: string[]) {
    const base = this.apiKey ? "https://api.jup.ag/price/v3" : "https://lite-api.jup.ag/price/v3";
    const response = await this.fetcher(`${base}?ids=${mints.join(",")}`, {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : {},
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return;
    const payload = JupiterPrice.parse(await response.json());
    const at = Date.now();
    for (const [mint, price] of Object.entries(payload)) {
      if (!price || !Number.isFinite(price.usdPrice) || price.usdPrice <= 0) continue;
      this.prices.set(mint, {
        usd: price.usdPrice,
        change24hPct: price.priceChange24h ?? null,
        underlyingUsd: price.stockData?.price ?? null,
        at,
      });
    }
  }
}
