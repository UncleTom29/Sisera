import type { PublicStock, ReferenceMarket, SolanaWallet } from "./api";

export type ValuedHolding = {
  mint: string;
  symbol: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  source: "xstocks" | "unpriced";
};

export type WalletObservation = {
  holdings: ValuedHolding[];
  pricedValueUsd: number;
  unpricedCount: number;
  largestSharePct: number | null;
  solValueUsd: number | null;
};

export function valueSolanaWallet(
  wallet: SolanaWallet,
  stocks: readonly PublicStock[],
  referenceMarkets: readonly ReferenceMarket[],
  now = Date.now(),
): WalletObservation {
  const byMint = new Map(stocks.map((stock) => [stock.mint, stock]));
  const holdings = wallet.holdings.map((holding): ValuedHolding => {
    const amount = Number(holding.rawBalance) / 10 ** holding.decimals;
    const stock = byMint.get(holding.mint);
    const price = Number(stock?.dexPriceUsd);
    const fresh = stock && now - Date.parse(stock.fetchedAt) <= 5 * 60_000;
    const priced =
      fresh &&
      !stock.tradingHalted &&
      Number.isFinite(price) &&
      price > 0 &&
      Number.isFinite(amount) &&
      amount >= 0;
    return {
      mint: holding.mint,
      symbol: holding.symbol ?? stock?.symbol ?? holding.name ?? "Unknown token",
      amount,
      priceUsd: priced ? price : null,
      valueUsd: priced ? amount * price : null,
      source: priced ? "xstocks" : "unpriced",
    };
  });
  const pricedValueUsd = holdings.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
  const largestValue = Math.max(0, ...holdings.map((holding) => holding.valueUsd ?? 0));
  const sol = referenceMarkets.find((market) => market.symbol === "SOLUSDT");
  const solFresh = sol && now - Date.parse(sol.observedAt) <= 5 * 60_000;
  const solValueUsd =
    solFresh && Number.isFinite(sol.priceUsd) && sol.priceUsd > 0
      ? (Number(wallet.solLamports) / 1e9) * sol.priceUsd
      : null;
  return {
    holdings,
    pricedValueUsd,
    unpricedCount: holdings.filter((holding) => holding.valueUsd === null).length,
    largestSharePct: pricedValueUsd > 0 ? (largestValue / pricedValueUsd) * 100 : null,
    solValueUsd,
  };
}
