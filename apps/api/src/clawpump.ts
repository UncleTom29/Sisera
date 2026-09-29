import { z } from "zod";

/**
 * Clawpump integration. The public token directory (https://clawpump.tech/api/tokens) needs no
 * key. The partner API (https://clawpump.tech/api/v1, reference at clawpump.tech/developers)
 * authenticates with a server-side cpk_ key and always uses the apex domain, because the agents
 * subdomain redirects across hosts and drops the Authorization header.
 */

const Numeric = z.union([z.string(), z.number()]).nullable().optional();

const Token = z
  .object({
    mint: z.string().optional(),
    address: z.string().optional(),
    symbol: z.string(),
    name: z.string(),
    verified: z.boolean().optional(),
    price: Numeric,
    marketCap: Numeric,
    liquidity: Numeric,
  })
  .passthrough();

const SearchResponse = z.object({
  tokens: z.array(Token).default([]),
  sources: z.unknown().optional(),
  droppedUnverified: z.number().optional(),
});
const PriceResponse = z.object({
  mint: z.string(),
  symbol: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  price: Numeric,
  currency: z.string().optional(),
  change24h: Numeric,
  volume24h: Numeric,
  marketCap: Numeric,
  liquidity: Numeric,
  source: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});
const PumpPairs = z.object({
  assets: z.array(
    z.object({
      mint: z.string(),
      symbol: z.string(),
      name: z.string(),
      decimals: z.number(),
      imageUrl: z.string().nullable().optional(),
    }),
  ),
  creatorFeeBps: z.object({ min: z.number(), max: z.number(), default: z.number() }),
});
export type PumpPairs = z.infer<typeof PumpPairs>;

const Agent = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.string().optional(),
    walletAddress: z.string().nullable().optional(),
    skills: z.array(z.string()).optional(),
    model: z.string().nullable().optional(),
    tokenAddress: z.string().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();
export type ClawpumpAgent = z.infer<typeof Agent>;

const SelfFundedQuote = z
  .object({
    payment: z.object({
      method: z.string(),
      amountLamports: z.number().int().positive(),
      amountSol: z.number().optional(),
      payTo: z.string(),
      payFrom: z.string().optional(),
      validForSeconds: z.number().optional(),
      breakdown: z.record(z.unknown()).optional(),
    }),
    retryWith: z.object({ preflightToken: z.string() }).passthrough(),
  })
  .passthrough();
export type SelfFundedQuote = z.infer<typeof SelfFundedQuote>;

const LaunchResult = z
  .object({
    success: z.boolean().optional(),
    status: z.string().optional(),
    mintAddress: z.string().optional(),
    txHash: z.string().nullable().optional(),
    pumpUrl: z.string().optional(),
    explorerUrl: z.string().optional(),
    payoutWallet: z.string().optional(),
    idempotent: z.boolean().optional(),
    pumpQuoteAsset: z
      .object({
        mint: z.string(),
        symbol: z.string(),
        decimals: z.number(),
        creatorFeeBps: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();
export type LaunchResult = z.infer<typeof LaunchResult>;

export class ClawpumpError extends Error {
  constructor(
    readonly status: number,
    readonly providerRequestId: string | null,
    readonly code: string | null = null,
    readonly body: Record<string, unknown> | null = null,
  ) {
    super(`Clawpump returned ${status}${code ? ` (${code})` : ""}`);
  }
}

export class ClawpumpClient {
  private pairsCache: { until: number; value: PumpPairs } | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {
    if (!/^cpk_[A-Za-z0-9_-]{43}$/.test(apiKey)) throw new Error("Clawpump partner key is invalid");
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(`https://clawpump.tech/api/v1/${path}`);
    if (options.query) url.search = new URLSearchParams(options.query).toString();
    const response = await this.fetcher(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      redirect: "error",
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok && response.status !== 202) {
      const meta = body?.meta as { requestId?: unknown } | undefined;
      throw new ClawpumpError(
        response.status,
        typeof meta?.requestId === "string" ? meta.requestId : null,
        typeof body?.code === "string" ? body.code : null,
        body,
      );
    }
    return { status: response.status, body };
  }

  async search(query: string) {
    return SearchResponse.parse(
      (await this.request("GET", "tokens/search", { query: { query, limit: "20" } })).body,
    );
  }

  async price(mint: string) {
    return PriceResponse.parse((await this.request("GET", "price", { query: { mint } })).body);
  }

  async pairs(): Promise<PumpPairs> {
    if (this.pairsCache && this.pairsCache.until > Date.now()) return this.pairsCache.value;
    const value = PumpPairs.parse((await this.request("GET", "pump-pairs")).body);
    this.pairsCache = { until: Date.now() + 10 * 60_000, value };
    return value;
  }

  async listAgents(): Promise<ClawpumpAgent[]> {
    return z.object({ agents: z.array(Agent) }).parse((await this.request("GET", "agents")).body)
      .agents;
  }

  async getAgent(agentId: string): Promise<ClawpumpAgent> {
    const body = (await this.request("GET", `agents/${encodeURIComponent(agentId)}`))
      .body as Record<string, unknown>;
    return Agent.parse((body.agent as Record<string, unknown> | undefined) ?? body);
  }

  /**
   * Creates the Clawpump agent that represents a Sisera strategy onchain. Only the base skill
   * bundle is enabled: Sisera's own runtime and risk engine make trading decisions, so the
   * Clawpump agent is not given the trading or sniper skills.
   */
  async createAgent(input: {
    name: string;
    persona: string;
    systemPrompt: string;
  }): Promise<ClawpumpAgent> {
    const body = (
      await this.request("POST", "agents", {
        body: {
          name: input.name,
          persona: input.persona,
          system_prompt: input.systemPrompt,
          temperature: 0.2,
          strategy: "monitor-exit",
        },
      })
    ).body as Record<string, unknown>;
    return Agent.parse((body.agent as Record<string, unknown> | undefined) ?? body);
  }

  async selfFundedQuote(input: SelfFundedLaunchInput): Promise<SelfFundedQuote> {
    return SelfFundedQuote.parse(
      (
        await this.request("POST", "launch/self-funded", {
          body: { ...selfFundedBody(input), preflight: true },
          timeoutMs: 120_000,
        })
      ).body,
    );
  }

  /**
   * Completes a paid launch. Clawpump is idempotent on txSignature, so an identical retry returns
   * the existing launch; a 202 means the paid launch is still confirming.
   */
  async completeSelfFundedLaunch(
    input: SelfFundedLaunchInput & { txSignature: string; preflightToken: string },
  ): Promise<{ pending: boolean; result: LaunchResult | null }> {
    const { status, body } = await this.request("POST", "launch/self-funded", {
      body: {
        ...selfFundedBody(input),
        txSignature: input.txSignature,
        preflightToken: input.preflightToken,
      },
      timeoutMs: 120_000,
    });
    if (status === 202) return { pending: true, result: null };
    return { pending: false, result: LaunchResult.parse(body) };
  }
}

export type SelfFundedLaunchInput = {
  agentId: string;
  agentName: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  walletAddress: string;
  pumpQuoteMint?: string;
  pumpCreatorFeeBps?: number;
  devBuySol?: number;
  website?: string;
  twitter?: string;
};

function selfFundedBody(input: SelfFundedLaunchInput) {
  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    imageUrl: input.imageUrl,
    agentId: input.agentId,
    agentName: input.agentName,
    walletAddress: input.walletAddress,
    devBuySol: input.devBuySol ?? 0,
    ...(input.pumpQuoteMint ? { pumpQuoteMint: input.pumpQuoteMint } : {}),
    ...(input.pumpQuoteMint && input.pumpCreatorFeeBps
      ? { pumpCreatorFeeBps: input.pumpCreatorFeeBps }
      : {}),
    ...(input.website ? { website: input.website } : {}),
    ...(input.twitter ? { twitter: input.twitter } : {}),
  };
}

// ----------------------------------------------------------------------------- public directory

const DirectoryToken = z
  .object({
    mintAddress: z.string(),
    name: z.string(),
    symbol: z.string(),
    description: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    marketCap: z.number().nullable().optional(),
    price: z.number().nullable().optional(),
    volume24h: z.number().nullable().optional(),
    volumeAllTime: z.number().nullable().optional(),
    liquidity: z.number().nullable().optional(),
    quoteAsset: z
      .object({ mint: z.string(), symbol: z.string(), name: z.string().nullable().optional() })
      .nullable()
      .optional(),
    agentId: z.string().nullable().optional(),
    agentName: z.string().nullable().optional(),
    verified: z.boolean().optional(),
    communityVerified: z.boolean().optional(),
    xVerified: z.boolean().optional(),
    isGraduated: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    website: z.string().nullable().optional(),
    twitter: z.string().nullable().optional(),
    telegram: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    launchPlatform: z.string().nullable().optional(),
    allocationBps: z.number().nullable().optional(),
    vestCliffDays: z.number().nullable().optional(),
    vestDurationDays: z.number().nullable().optional(),
    mechanics: z
      .array(z.object({ kind: z.string(), status: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

export type DirectoryToken = {
  mint: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  volumeAllTimeUsd: number | null;
  liquidityUsd: number | null;
  quoteMint: string | null;
  quoteSymbol: string | null;
  agentId: string | null;
  agentName: string | null;
  verified: boolean;
  xVerified: boolean;
  graduated: boolean;
  tags: string[];
  website: string | null;
  twitter: string | null;
  createdAt: string | null;
  launchPlatform: string | null;
  creatorAllocationBps: number | null;
  vesting: { cliffDays: number | null; durationDays: number | null } | null;
};

export class ClawpumpDirectory {
  private readonly cache = new Map<
    string,
    { until: number; value: { tokens: DirectoryToken[]; total: number; hasMore: boolean } }
  >();

  constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

  async list(
    query: {
      sort?: "volume" | "mcap" | "new";
      period?: "24h" | "7d";
      limit?: number;
      offset?: number;
      q?: string;
    } = {},
  ) {
    const key = JSON.stringify(query);
    const cached = this.cache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const url = new URL("https://clawpump.tech/api/tokens");
    url.searchParams.set("sort", query.sort ?? "volume");
    url.searchParams.set("period", query.period ?? "24h");
    url.searchParams.set("limit", String(query.limit ?? 60));
    url.searchParams.set("offset", String(query.offset ?? 0));
    if (query.q) url.searchParams.set("q", query.q);
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new ClawpumpError(response.status, null);
    const payload = z
      .object({ tokens: z.array(DirectoryToken), total: z.number(), hasMore: z.boolean() })
      .parse(await response.json());
    const value = {
      tokens: payload.tokens.map(
        (token): DirectoryToken => ({
          mint: token.mintAddress,
          name: token.name,
          symbol: token.symbol,
          description: token.description ?? null,
          imageUrl: token.imageUrl
            ? token.imageUrl.startsWith("/")
              ? `https://clawpump.tech${token.imageUrl}`
              : token.imageUrl
            : null,
          priceUsd: token.price ?? null,
          marketCapUsd: token.marketCap ?? null,
          volume24hUsd: token.volume24h ?? null,
          volumeAllTimeUsd: token.volumeAllTime ?? null,
          liquidityUsd: token.liquidity ?? null,
          quoteMint: token.quoteAsset?.mint ?? null,
          quoteSymbol: token.quoteAsset?.symbol ?? null,
          agentId: token.agentId ?? null,
          agentName: token.agentName ?? null,
          verified: token.verified ?? false,
          xVerified: token.xVerified ?? false,
          graduated: token.isGraduated ?? false,
          tags: token.tags ?? [],
          website: token.website ?? null,
          twitter: token.twitter ?? null,
          createdAt: token.createdAt ?? null,
          launchPlatform: token.launchPlatform ?? null,
          creatorAllocationBps: token.allocationBps ?? null,
          vesting:
            token.vestCliffDays != null || token.vestDurationDays != null
              ? {
                  cliffDays: token.vestCliffDays ?? null,
                  durationDays: token.vestDurationDays ?? null,
                }
              : null,
        }),
      ),
      total: payload.total,
      hasMore: payload.hasMore,
    };
    this.cache.set(key, { until: Date.now() + 30_000, value });
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value ?? "");
    return value;
  }

  /** Finds one token by mint, scanning the most active pages first. */
  async find(mint: string): Promise<DirectoryToken | null> {
    const direct = await this.list({ q: mint, limit: 5 }).catch(() => null);
    const hit = direct?.tokens.find((token) => token.mint === mint);
    if (hit) return hit;
    for (const sort of ["volume", "mcap", "new"] as const) {
      const page = await this.list({ sort, limit: 100 }).catch(() => null);
      const found = page?.tokens.find((token) => token.mint === mint);
      if (found) return found;
    }
    return null;
  }
}
