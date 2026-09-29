import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { ClawpumpDirectory, DirectoryToken } from "../clawpump.js";
import type { AssetCatalog, CatalogAsset } from "./catalog.js";

export type HolderConcentration = {
  mint: string;
  supply: number;
  top10WalletPct: number;
  top1WalletPct: number;
  programHeldPct: number;
  walletsSampled: number;
  observedAt: string;
  method: string;
};

export type AgentRisk = {
  score: number;
  level: "low" | "moderate" | "high" | "extreme";
  components: Array<{ name: string; points: number; detail: string }>;
};

const LargestAccounts = z.object({
  value: z.array(
    z.object({ address: z.string(), uiAmount: z.number().nullable(), amount: z.string() }),
  ),
});
const Supply = z.object({
  value: z.object({ uiAmount: z.number().nullable(), amount: z.string(), decimals: z.number() }),
});
const MultipleAccounts = z.object({
  value: z.array(
    z
      .object({
        data: z
          .object({
            parsed: z.object({ info: z.object({ owner: z.string() }).passthrough() }).passthrough(),
          })
          .passthrough(),
      })
      .passthrough()
      .nullable(),
  ),
});

/**
 * Clawpump agent-token analytics: how each token compares with its paired stock, how
 * concentrated its holders are, and a transparent risk score built from observable inputs.
 */
export class AgentMarketService {
  private readonly concentrationCache = new Map<
    string,
    { until: number; value: HolderConcentration }
  >();

  constructor(
    private readonly catalog: AssetCatalog,
    private readonly directory: ClawpumpDirectory,
    private readonly rpcUrl: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {}

  private async rpc(method: string, params: unknown[]) {
    const response = await this.fetcher(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`RPC returned ${response.status}`);
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    if (body.error || body.result === undefined) throw new Error(`${method} failed`);
    return body.result;
  }

  /**
   * Top-holder concentration among ordinary wallets. Token accounts owned by program-derived
   * addresses (bonding curves, AMM vaults, lockers) are reported separately, because treating a
   * liquidity pool as a whale would overstate concentration.
   */
  async concentration(mint: string): Promise<HolderConcentration> {
    const cached = this.concentrationCache.get(mint);
    if (cached && cached.until > Date.now()) return cached.value;
    const [largest, supply] = await Promise.all([
      this.rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]).then((value) =>
        LargestAccounts.parse(value),
      ),
      this.rpc("getTokenSupply", [mint]).then((value) => Supply.parse(value)),
    ]);
    const accounts = MultipleAccounts.parse(
      await this.rpc("getMultipleAccounts", [
        largest.value.map((account) => account.address),
        { encoding: "jsonParsed" },
      ]),
    );
    const total = Number(supply.value.amount) / 10 ** supply.value.decimals;
    let programHeld = 0;
    const wallets: number[] = [];
    largest.value.forEach((account, index) => {
      const owner = accounts.value[index]?.data.parsed.info.owner;
      const amount = Number(account.amount) / 10 ** supply.value.decimals;
      if (!owner) return;
      if (PublicKey.isOnCurve(new PublicKey(owner).toBytes())) wallets.push(amount);
      else programHeld += amount;
    });
    wallets.sort((a, b) => b - a);
    const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
    const value: HolderConcentration = {
      mint,
      supply: total,
      top10WalletPct: pct(wallets.slice(0, 10).reduce((sum, amount) => sum + amount, 0)),
      top1WalletPct: pct(wallets[0] ?? 0),
      programHeldPct: pct(programHeld),
      walletsSampled: wallets.length,
      observedAt: new Date().toISOString(),
      method:
        "Top 20 token accounts; program-owned accounts (pools, curves, lockers) excluded from wallet concentration.",
    };
    this.concentrationCache.set(mint, { until: Date.now() + 10 * 60_000, value });
    return value;
  }

  riskScore(
    asset: CatalogAsset,
    token: DirectoryToken | null,
    concentration: HolderConcentration | null,
  ): AgentRisk {
    const components: AgentRisk["components"] = [];
    const add = (name: string, points: number, detail: string) =>
      components.push({ name, points: Math.round(points), detail });
    const liquidity = asset.liquidityUsd;
    if (liquidity == null) add("Liquidity", 25, "Liquidity is unknown.");
    else
      add(
        "Liquidity",
        liquidity < 10_000 ? 30 : liquidity < 50_000 ? 20 : liquidity < 250_000 ? 10 : 3,
        `$${Math.round(liquidity).toLocaleString("en-US")} of pooled liquidity.`,
      );
    if (!concentration) add("Holder concentration", 15, "Holder data unavailable.");
    else
      add(
        "Holder concentration",
        concentration.top10WalletPct > 60
          ? 25
          : concentration.top10WalletPct > 40
            ? 18
            : concentration.top10WalletPct > 25
              ? 10
              : 4,
        `Top 10 wallets hold ${concentration.top10WalletPct.toFixed(1)}% of supply.`,
      );
    const move = Math.abs(asset.change24hPct ?? 0);
    add(
      "Volatility",
      move > 50 ? 20 : move > 25 ? 14 : move > 10 ? 8 : 3,
      `${(asset.change24hPct ?? 0).toFixed(1)}% over 24h.`,
    );
    const ageDays = token?.createdAt
      ? (Date.now() - Date.parse(token.createdAt)) / 86_400_000
      : null;
    add(
      "Track record",
      ageDays == null ? 10 : ageDays < 3 ? 15 : ageDays < 30 ? 8 : 2,
      ageDays == null ? "Launch date unknown." : `Launched ${ageDays.toFixed(0)} days ago.`,
    );
    if (token) {
      const verification =
        (token.verified ? 0 : 5) + (token.xVerified ? 0 : 3) + (token.graduated ? 0 : 4);
      add(
        "Verification",
        verification,
        `${token.verified ? "Verified" : "Unverified"}, ${token.xVerified ? "X-verified" : "no X verification"}, ${token.graduated ? "graduated" : "still on its launch curve"}.`,
      );
      if (token.creatorAllocationBps && token.creatorAllocationBps > 500)
        add(
          "Creator allocation",
          token.vesting?.durationDays ? 3 : 8,
          `Creator holds ${(token.creatorAllocationBps / 100).toFixed(1)}%${token.vesting?.durationDays ? ` vesting over ${token.vesting.durationDays} days` : " without disclosed vesting"}.`,
        );
    }
    const score = Math.min(
      100,
      components.reduce((sum, component) => sum + component.points, 0),
    );
    return {
      score,
      level: score >= 70 ? "extreme" : score >= 50 ? "high" : score >= 30 ? "moderate" : "low",
      components,
    };
  }

  async detail(mint: string) {
    const [asset, token] = await Promise.all([
      this.catalog.byMint(mint),
      this.directory.find(mint).catch(() => null),
    ]);
    if (!asset) return null;
    const [concentration, paired] = await Promise.all([
      this.concentration(mint).catch(() => null),
      asset.pairedStock ? this.catalog.byMint(asset.pairedStock.mint) : Promise.resolve(null),
    ]);
    return {
      asset,
      token,
      concentration,
      risk: this.riskScore(asset, token, concentration),
      pairedStock: paired
        ? {
            symbol: paired.symbol,
            name: paired.name,
            mint: paired.mint,
            priceUsd: paired.priceUsd,
            change24hPct: paired.change24hPct,
            relativePerformancePct:
              asset.change24hPct != null && paired.change24hPct != null
                ? asset.change24hPct - paired.change24hPct
                : null,
          }
        : null,
    };
  }

  /** Every agent token paired with a stock token, compared with that stock over 24h. */
  async stockPaired() {
    const assets = await this.catalog.list({ includeAgents: true });
    const bySymbolMint = new Map(
      assets.filter((asset) => asset.kind !== "agent_token").map((asset) => [asset.mint, asset]),
    );
    return assets
      .filter((asset) => asset.kind === "agent_token" && asset.pairedStock)
      .map((asset) => {
        const stock = bySymbolMint.get(asset.pairedStock?.mint ?? "");
        const relative =
          asset.change24hPct != null && stock?.change24hPct != null
            ? asset.change24hPct - stock.change24hPct
            : null;
        return {
          mint: asset.mint,
          symbol: asset.symbol,
          name: asset.name,
          imageUrl: asset.imageUrl,
          priceUsd: asset.priceUsd,
          change24hPct: asset.change24hPct,
          liquidityUsd: asset.liquidityUsd,
          volume24hUsd: asset.volume24hUsd,
          marketCapUsd: asset.marketCapUsd,
          pairedStock: {
            symbol: stock?.symbol ?? asset.pairedStock?.symbol ?? "",
            mint: asset.pairedStock?.mint ?? "",
            change24hPct: stock?.change24hPct ?? null,
          },
          relativePerformancePct: relative,
          outperforming: relative == null ? null : relative > 0,
        };
      })
      .sort(
        (a, b) =>
          (b.relativePerformancePct ?? Number.NEGATIVE_INFINITY) -
          (a.relativePerformancePct ?? Number.NEGATIVE_INFINITY),
      );
  }

  /**
   * Ranks agent tokens. "quality" favours deep liquidity and low wallet concentration; holder
   * data is fetched for the most liquid candidates only, to bound RPC load.
   */
  async rank(by: "liquidity" | "momentum" | "volume" | "quality" | "risk", limit = 25) {
    const assets = (await this.catalog.list({ includeAgents: true })).filter(
      (asset) => asset.kind === "agent_token",
    );
    const tokens = new Map((await this.catalog.agentTokens()).map((token) => [token.mint, token]));
    let ranked = [...assets];
    if (by === "liquidity") ranked.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
    if (by === "momentum")
      ranked.sort(
        (a, b) =>
          (b.change24hPct ?? Number.NEGATIVE_INFINITY) -
          (a.change24hPct ?? Number.NEGATIVE_INFINITY),
      );
    if (by === "volume") ranked.sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
    if (by === "quality" || by === "risk")
      ranked = ranked
        .filter((asset) => (asset.liquidityUsd ?? 0) > 25_000)
        .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
        .slice(0, 30);
    const rows = await Promise.all(
      ranked.slice(0, by === "quality" || by === "risk" ? 30 : limit).map(async (asset) => {
        const concentration =
          by === "quality" || by === "risk"
            ? await this.concentration(asset.mint).catch(() => null)
            : null;
        const token = tokens.get(asset.mint) ?? null;
        const risk = this.riskScore(asset, token, concentration);
        return {
          mint: asset.mint,
          symbol: asset.symbol,
          name: asset.name,
          imageUrl: asset.imageUrl,
          priceUsd: asset.priceUsd,
          change24hPct: asset.change24hPct,
          liquidityUsd: asset.liquidityUsd,
          volume24hUsd: asset.volume24hUsd,
          marketCapUsd: asset.marketCapUsd,
          pairedStock: asset.pairedStock,
          top10WalletPct: concentration?.top10WalletPct ?? null,
          risk,
          graduated: token?.graduated ?? null,
        };
      }),
    );
    if (by === "quality")
      rows.sort(
        (a, b) =>
          Math.log10((b.liquidityUsd ?? 1) + 1) * 10 -
          (b.top10WalletPct ?? 50) * 0.5 -
          (Math.log10((a.liquidityUsd ?? 1) + 1) * 10 - (a.top10WalletPct ?? 50) * 0.5),
      );
    if (by === "risk") rows.sort((a, b) => a.risk.score - b.risk.score);
    return rows.slice(0, limit);
  }

  /** New launches, biggest movers and volume leaders across the agent market today. */
  async today() {
    const [assets, fresh] = await Promise.all([
      this.catalog
        .list({ includeAgents: true })
        .then((all) => all.filter((asset) => asset.kind === "agent_token")),
      this.directory.list({ sort: "new", limit: 50 }).catch(() => null),
    ]);
    const liquid = assets.filter(
      (asset) => (asset.liquidityUsd ?? 0) > 10_000 && asset.change24hPct != null,
    );
    const since = Date.now() - 86_400_000;
    return {
      gainers: [...liquid]
        .sort((a, b) => (b.change24hPct ?? 0) - (a.change24hPct ?? 0))
        .slice(0, 8)
        .map(summaryRow),
      losers: [...liquid]
        .sort((a, b) => (a.change24hPct ?? 0) - (b.change24hPct ?? 0))
        .slice(0, 8)
        .map(summaryRow),
      volumeLeaders: [...assets]
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
        .slice(0, 8)
        .map(summaryRow),
      newLaunches: (fresh?.tokens ?? [])
        .filter((token) => token.createdAt && Date.parse(token.createdAt) >= since)
        .slice(0, 12)
        .map((token) => ({
          mint: token.mint,
          symbol: token.symbol,
          name: token.agentName ?? token.name,
          createdAt: token.createdAt,
          quoteSymbol: token.quoteSymbol,
          marketCapUsd: token.marketCapUsd,
        })),
      stockPairedCount: assets.filter((asset) => asset.pairedStock).length,
      observedAt: new Date().toISOString(),
    };
  }
}

function summaryRow(asset: CatalogAsset) {
  return {
    mint: asset.mint,
    symbol: asset.symbol,
    name: asset.name,
    change24hPct: asset.change24hPct,
    liquidityUsd: asset.liquidityUsd,
    volume24hUsd: asset.volume24hUsd,
    pairedStock: asset.pairedStock?.symbol ?? null,
  };
}
