import type { Candle } from "@sisera/domain";
import { z } from "zod";
import type { ChartInterval, GeckoTerminalCandles } from "../geckoterminal.js";
import type { CatalogAsset } from "./catalog.js";

export type HistorySeries = {
  candles: Candle[];
  source: string;
  /** Explains when the series is a proxy, such as the underlying share for a tokenized stock. */
  basis: string;
  timeframe: string;
};

const INTERVAL_MS: Record<string, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

const YahooChart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(
              z.object({
                open: z.array(z.number().nullable()),
                high: z.array(z.number().nullable()),
                low: z.array(z.number().nullable()),
                close: z.array(z.number().nullable()),
                volume: z.array(z.number().nullable()),
              }),
            ),
          }),
        }),
      )
      .nullable(),
  }),
});

const candle = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Candle => ({
  time: Math.floor(time),
  open: String(open),
  high: String(high),
  low: String(low),
  close: String(close),
  volume: String(Math.max(0, volume)),
});

/**
 * Long price histories for backtests. Crypto uses Binance klines paged back up to `years`;
 * tokenized equities use the underlying share's exchange history, labelled as a proxy, because
 * the tokens themselves have traded for too short a time; other Solana tokens use DEX history.
 */
export class HistoryService {
  private readonly cache = new Map<string, { until: number; value: HistorySeries }>();

  constructor(
    private readonly binanceBaseUrl: string,
    private readonly gecko: GeckoTerminalCandles,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  async binance(
    symbol: string,
    timeframe: string,
    years: number,
    maxRequests = 50,
  ): Promise<HistorySeries> {
    const key = `binance:${symbol}:${timeframe}:${years}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const step = INTERVAL_MS[timeframe] ?? 3_600_000;
    let start = Date.now() - years * 365.25 * 86_400_000;
    const candles: Candle[] = [];
    for (let request = 0; request < maxRequests && start < Date.now(); request++) {
      const url = new URL(`${this.binanceBaseUrl}/api/v3/klines`);
      url.search = new URLSearchParams({
        symbol,
        interval: timeframe,
        startTime: String(Math.floor(start)),
        limit: "1000",
      }).toString();
      const response = await this.fetcher(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Binance klines returned ${response.status}`);
      const rows = z.array(z.array(z.union([z.number(), z.string()]))).parse(await response.json());
      if (!rows.length) break;
      for (const row of rows)
        candles.push(
          candle(
            Number(row[0]) / 1000,
            Number(row[1]),
            Number(row[2]),
            Number(row[3]),
            Number(row[4]),
            Number(row[7] ?? row[5]),
          ),
        );
      const last = Number(rows.at(-1)?.[0] ?? 0);
      if (rows.length < 1000) break;
      start = last + step;
    }
    const value: HistorySeries = {
      candles,
      source: "binance-klines",
      basis: `${symbol} spot history`,
      timeframe,
    };
    this.cache.set(key, { until: Date.now() + 30 * 60_000, value });
    return value;
  }

  async equity(ticker: string, timeframe: string, years: number): Promise<HistorySeries> {
    const daily = timeframe === "1d" || timeframe === "4h";
    const interval = daily ? "1d" : "60m";
    // Yahoo serves hourly bars for roughly two years only.
    const range = daily ? `${Math.min(10, Math.ceil(years))}y` : "730d";
    const key = `yahoo:${ticker}:${interval}:${range}`;
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const response = await this.fetcher(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
      { headers: { "user-agent": "Mozilla/5.0 Sisera" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw new Error(`Equity history returned ${response.status}`);
    const result = YahooChart.parse(await response.json()).chart.result?.[0];
    const quote = result?.indicators.quote[0];
    const candles: Candle[] = [];
    for (const [index, time] of (result?.timestamp ?? []).entries()) {
      const close = quote?.close[index];
      if (close == null) continue;
      candles.push(
        candle(
          time,
          quote?.open[index] ?? close,
          quote?.high[index] ?? close,
          quote?.low[index] ?? close,
          close,
          quote?.volume[index] ?? 0,
        ),
      );
    }
    const value: HistorySeries = {
      candles,
      source: "public-equity-history",
      basis: `${ticker} exchange-listed share history (proxy for the tokenized stock)`,
      timeframe: daily ? "1d" : "1h",
    };
    this.cache.set(key, { until: Date.now() + 60 * 60_000, value });
    return value;
  }

  async solanaToken(mint: string, timeframe: string): Promise<HistorySeries> {
    const interval = (
      ["5m", "15m", "1h", "4h", "1d"].includes(timeframe) ? timeframe : "1h"
    ) as ChartInterval;
    const rows = await this.gecko.history(mint, interval);
    return {
      candles: rows.map((row) =>
        candle(Date.parse(row.time) / 1000, row.open, row.high, row.low, row.close, row.volumeUsd),
      ),
      source: "geckoterminal",
      basis: "Onchain DEX history for the token itself",
      timeframe: interval,
    };
  }

  /** Resolves a universe entry (BTCUSDT, AAPLx, a PreStocks symbol or a mint) to a history. */
  async forUniverseEntry(
    entry: string,
    timeframe: string,
    years: number,
    resolveAsset: (key: string) => Promise<CatalogAsset | null>,
  ): Promise<HistorySeries> {
    const upper = entry.toUpperCase();
    if (/^[A-Z0-9]{2,20}(USDT|USDC)$/.test(upper)) return this.binance(upper, timeframe, years);
    const asset = await resolveAsset(entry.replace(/^(clawpump|prestocks|xstocks):/i, ""));
    if (!asset) throw new Error(`No market found for ${entry}`);
    if (asset.kind === "public_equity") return this.equity(asset.underlying, timeframe, years);
    return this.solanaToken(asset.mint, timeframe);
  }
}
