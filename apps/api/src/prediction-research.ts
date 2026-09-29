import type { PredictionMarket } from "@sisera/domain";
import { z } from "zod";

type Fetcher = typeof globalThis.fetch;

const PriceHistory = z.object({
  history: z.array(z.object({ t: z.number(), p: z.number() })),
});
const Book = z.object({
  bids: z.array(z.object({ price: z.string(), size: z.string() })).default([]),
  asks: z.array(z.object({ price: z.string(), size: z.string() })).default([]),
  last_trade_price: z.string().optional(),
});
const Kline = z
  .tuple([z.number(), z.string(), z.string(), z.string(), z.string()])
  .rest(z.unknown());

/** Binance pairs for the crypto assets Polymarket lists price markets on. */
const assetPairs: Record<string, string> = {
  btc: "BTCUSDT",
  bitcoin: "BTCUSDT",
  eth: "ETHUSDT",
  ethereum: "ETHUSDT",
  sol: "SOLUSDT",
  solana: "SOLUSDT",
  xrp: "XRPUSDT",
  doge: "DOGEUSDT",
  dogecoin: "DOGEUSDT",
  bnb: "BNBUSDT",
  ada: "ADAUSDT",
  cardano: "ADAUSDT",
  hype: "HYPEUSDT",
  sui: "SUIUSDT",
  link: "LINKUSDT",
  avax: "AVAXUSDT",
  ltc: "LTCUSDT",
};

type StrikeMarket = {
  pair: string;
  strike: number;
  kind: "touch" | "settle";
  direction: "up" | "down";
};

/** Reads the asset, strike, and payoff shape from a crypto price market's title. */
export function parseStrikeMarket(market: PredictionMarket): StrikeMarket | null {
  const eventTitle = market.eventTitle ?? market.title;
  const outcomeTitle = market.marketTitle ?? "";
  const words = [market.subcategory ?? "", ...eventTitle.toLowerCase().split(/[^a-z]+/)];
  const pair = words.map((word) => assetPairs[word.toLowerCase()]).find(Boolean);
  if (!pair) return null;
  const number = /([\d,]+(?:\.\d+)?)\s*(k|m)?/i.exec(outcomeTitle.replace(/\$/g, ""));
  if (!number?.[1]) return null;
  const scale =
    number[2]?.toLowerCase() === "k" ? 1_000 : number[2]?.toLowerCase() === "m" ? 1e6 : 1;
  const strike = Number(number[1].replaceAll(",", "")) * scale;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const title = eventTitle.toLowerCase();
  if (/\bhit\b|\breach\b|\bdip\b/.test(title))
    return { pair, strike, kind: "touch", direction: outcomeTitle.includes("↓") ? "down" : "up" };
  if (/\babove\b/.test(title)) return { pair, strike, kind: "settle", direction: "up" };
  if (/\bbelow\b/.test(title)) return { pair, strike, kind: "settle", direction: "down" };
  return null;
}

// Standard normal CDF (Abramowitz–Stegun 7.1.26).
function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const pctChange = (from: number | undefined, to: number) =>
  from == null || from <= 0 ? null : (to - from) * 100;

/** Latest probability at or before a moment, from an ascending history. */
function pointAt(history: Array<{ t: number; p: number }>, seconds: number) {
  let found: number | undefined;
  for (const point of history) {
    if (point.t > seconds) break;
    found = point.p;
  }
  return found;
}

export async function researchPredictionMarket(
  market: PredictionMarket,
  siblings: PredictionMarket[],
  fetcher: Fetcher = globalThis.fetch,
) {
  const yesToken = market.venueTokenIds?.[0];
  const current = Number(market.outcomes[0]?.probability ?? 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const [historyResult, bookResult] = await Promise.allSettled([
    yesToken
      ? fetcher(
          `https://clob.polymarket.com/prices-history?market=${yesToken}&interval=max&fidelity=60`,
          { signal: AbortSignal.timeout(8000) },
        ).then(async (response) => PriceHistory.parse(await response.json()).history)
      : Promise.resolve([]),
    yesToken
      ? fetcher(`https://clob.polymarket.com/book?token_id=${yesToken}`, {
          signal: AbortSignal.timeout(8000),
        }).then(async (response) => Book.parse(await response.json()))
      : Promise.resolve(null),
  ]);
  const history = historyResult.status === "fulfilled" ? historyResult.value : [];
  const book = bookResult.status === "fulfilled" ? bookResult.value : null;

  // Probability statistics, in percentage points.
  const probabilities = history.map((point) => point.p);
  const deviation = (moves: number[]) => {
    const mean = moves.reduce((sum, move) => sum + move, 0) / moves.length;
    return Math.sqrt(moves.reduce((sum, move) => sum + (move - mean) ** 2, 0) / moves.length);
  };
  const daily = history.filter((_, index) => index % 24 === 0).map((point) => point.p);
  const dailyMoves = daily.slice(1).map((value, index) => (value - (daily[index] ?? value)) * 100);
  const hourlyMoves = probabilities
    .slice(1)
    .map((value, index) => (value - (probabilities[index] ?? value)) * 100);
  // Young markets lack daily history, so scale hourly moves to a daily figure instead.
  const volatility =
    dailyMoves.length >= 5
      ? deviation(dailyMoves)
      : hourlyMoves.length >= 2
        ? deviation(hourlyMoves) * Math.sqrt(24)
        : null;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of probabilities) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) * 100);
  }
  const closesAt = market.closesAt ? Date.parse(market.closesAt) : null;
  const openedAt = market.openedAt
    ? Date.parse(market.openedAt)
    : history[0]
      ? history[0].t * 1000
      : null;
  const stats = {
    probability: current,
    change24hPts: pctChange(pointAt(history, nowSeconds - 86_400), current),
    change7dPts: pctChange(pointAt(history, nowSeconds - 7 * 86_400), current),
    change30dPts: pctChange(pointAt(history, nowSeconds - 30 * 86_400), current),
    sinceOpenPts: pctChange(history[0]?.p, current),
    high: probabilities.length ? Math.max(...probabilities) : null,
    low: probabilities.length ? Math.min(...probabilities) : null,
    dailyVolatilityPts: volatility,
    maxDrawdownPts: probabilities.length ? maxDrawdown : null,
    shareOfTimeAbove50: probabilities.length
      ? probabilities.filter((value) => value > 0.5).length / probabilities.length
      : null,
    daysOpen: openedAt ? (Date.now() - openedAt) / 86_400_000 : null,
    daysToClose: closesAt ? Math.max(0, (closesAt - Date.now()) / 86_400_000) : null,
    volumeUsd: market.volumeUsd ?? null,
  };

  // Order book: best prices and the dollars resting within five cents of them.
  const bids = (book?.bids ?? []).map((level) => ({
    price: Number(level.price),
    size: Number(level.size),
  }));
  const asks = (book?.asks ?? []).map((level) => ({
    price: Number(level.price),
    size: Number(level.size),
  }));
  const bestBid = bids.length ? Math.max(...bids.map((level) => level.price)) : null;
  const bestAsk = asks.length ? Math.min(...asks.map((level) => level.price)) : null;
  const orderBook = book
    ? {
        bestBid,
        bestAsk,
        spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
        bidDepthUsd: bids
          .filter((level) => bestBid != null && level.price >= bestBid - 0.05)
          .reduce((sum, level) => sum + level.price * level.size, 0),
        askDepthUsd: asks
          .filter((level) => bestAsk != null && level.price <= bestAsk + 0.05)
          .reduce((sum, level) => sum + level.price * level.size, 0),
        lastTrade: book.last_trade_price ? Number(book.last_trade_price) : null,
      }
    : null;

  const related = siblings
    .filter((sibling) => sibling.id !== market.id)
    .map((sibling) => ({
      id: sibling.id,
      title: sibling.marketTitle ?? sibling.title,
      probability: Number(sibling.outcomes[0]?.probability ?? 0),
    }))
    .sort((a, b) => b.probability - a.probability);

  return {
    marketId: market.id,
    history: history.map((point) => ({ time: point.t, value: point.p })),
    stats,
    orderBook,
    related,
    underlying: await underlyingResearch(market, closesAt, fetcher).catch(() => null),
    sources: ["polymarket-clob", ...(parseStrikeMarket(market) ? ["binance-spot"] : [])],
    measuredAt: new Date().toISOString(),
  };
}

/** For crypto price markets: where the asset is, what the strike needs, and how often it happens. */
async function underlyingResearch(
  market: PredictionMarket,
  closesAt: number | null,
  fetcher: Fetcher,
) {
  const strike = parseStrikeMarket(market);
  if (!strike || !closesAt) return null;
  const response = await fetcher(
    `https://data-api.binance.vision/api/v3/klines?symbol=${strike.pair}&interval=1d&limit=365`,
    { signal: AbortSignal.timeout(8000) },
  );
  const rows = z.array(Kline).parse(await response.json());
  const candles = rows.map(([time, open, high, low, close]) => ({
    time: Math.floor(time / 1000),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
  }));
  const last = candles.at(-1);
  if (!last || candles.length < 31) return null;
  const spot = last.close;
  const returns = candles
    .slice(-31)
    .slice(1)
    .map((candle, index) =>
      Math.log(candle.close / (candles.slice(-31)[index]?.close ?? candle.close)),
    );
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const dailyVol = Math.sqrt(
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length,
  );
  const annualVol = dailyVol * Math.sqrt(365);
  const days = Math.max((closesAt - Date.now()) / 86_400_000, 1 / 24);
  const years = days / 365;
  const sigmaRootT = annualVol * Math.sqrt(years);
  const up = strike.direction === "up";
  const distancePct = (strike.strike / spot - 1) * 100;
  const alreadyThere = up ? spot >= strike.strike : spot <= strike.strike;

  // Driftless lognormal model: settle uses the terminal distribution, touch uses the reflection principle.
  let modelProbability: number;
  if (strike.kind === "settle") {
    const d2 = (Math.log(spot / strike.strike) - 0.5 * annualVol ** 2 * years) / sigmaRootT;
    modelProbability = up ? normalCdf(d2) : 1 - normalCdf(d2);
  } else if (alreadyThere) {
    modelProbability = 1;
  } else {
    const barrier = Math.abs(Math.log(strike.strike / spot)) / sigmaRootT;
    modelProbability = Math.min(1, 2 * (1 - normalCdf(barrier)));
  }

  // Historical frequency: over the past year, how often did a move of this size happen within a
  // window as long as the time left in this market?
  const window = Math.max(1, Math.round(days));
  const needed = strike.strike / spot - 1;
  let hits = 0;
  let trials = 0;
  for (let start = 0; start + window < candles.length; start += 1) {
    const base = candles[start]?.close;
    if (!base) continue;
    const span = candles.slice(start + 1, start + 1 + window);
    const reached =
      strike.kind === "settle"
        ? up
          ? (span.at(-1)?.close ?? 0) / base - 1 >= needed
          : (span.at(-1)?.close ?? 0) / base - 1 <= needed
        : up
          ? Math.max(...span.map((candle) => candle.high)) / base - 1 >= needed
          : Math.min(...span.map((candle) => candle.low)) / base - 1 <= needed;
    trials += 1;
    if (reached) hits += 1;
  }

  return {
    symbol: strike.pair,
    spot,
    strike: strike.strike,
    kind: strike.kind,
    direction: strike.direction,
    distancePct,
    alreadyThere,
    annualizedVolatility: annualVol,
    daysToClose: days,
    modelProbability,
    historicalFrequency: trials ? hits / trials : null,
    historicalWindows: trials,
    marketProbability: Number(market.outcomes[0]?.probability ?? 0),
    candles: candles.slice(-120),
  };
}
