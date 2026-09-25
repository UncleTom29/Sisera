import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { OpenRouterResearchClient, compileIntent } from "@sisera/copilot";
import { listSolanaSwapOrders, recordSolanaWebhookEvents } from "@sisera/db";
import { OrderIntent, type PortfolioRiskState, type RiskLimits } from "@sisera/domain";
import type { Candle, Instrument, MarketSnapshot, OrderBook } from "@sisera/domain";
import {
  BinanceSpotProvider,
  CoinGeckoReferenceProvider,
  DeFiLlamaChainProvider,
  HyperliquidPerpProvider,
  MarketDataUnavailableError,
  PolymarketProvider,
  PreStocksProvider,
  PythProProvider,
} from "@sisera/market-data";
import { applyOrderEvent, createOrderRecord } from "@sisera/oms";
import { analyzeCandles } from "@sisera/quant";
import { evaluatePreTradeRisk } from "@sisera/risk";
import Fastify from "fastify";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { z } from "zod";
import { createAuthenticator, requirePermission } from "./auth.js";
import { ClawpumpClient } from "./clawpump.js";
import type { ApiConfig } from "./config.js";
import { parseHeliusWebhook, validWebhookSecret } from "./helius-webhook.js";
import { HeliusClient } from "./helius.js";
import { JupiterQuoteClient } from "./jupiter.js";
import { SolanaTradingService, TradeRejection } from "./solana-trading.js";
import { StockNewsClient } from "./stock-news.js";
import { XStocksClient } from "./xstocks.js";

export type RiskContext = {
  portfolio: z.infer<typeof PortfolioRiskState>;
  limits: z.infer<typeof RiskLimits>;
};

export type ApiDependencies = {
  marketData?: {
    getInstrument(symbol: string): Promise<Instrument>;
    getSnapshot(symbol: string): Promise<MarketSnapshot>;
    listMarkets?(
      symbols: readonly string[],
    ): Promise<Array<{ instrument: Instrument; snapshot: MarketSnapshot }>>;
    getCandles?(symbol: string, interval?: string, limit?: number): Promise<Candle[]>;
    getOrderBook?(symbol: string, limit?: number): Promise<OrderBook>;
  };
  predictions?: { listOpenMarkets(limit?: number): Promise<unknown[]> };
  loadRiskContext?: (portfolioId: string) => Promise<RiskContext | null>;
};

export async function buildApi(config: ApiConfig, dependencies: ApiDependencies = {}) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: true,
    genReqId: (request) => request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
  });
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "sisera_" });
  const requestCount = new Counter({
    name: "sisera_http_requests_total",
    help: "HTTP requests processed",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: "sisera_http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["method", "route"],
    registers: [registry],
  });
  const marketData =
    dependencies.marketData ?? new BinanceSpotProvider(config.BINANCE_SPOT_BASE_URL);
  const hyperliquid = new HyperliquidPerpProvider(config.HYPERLIQUID_BASE_URL);
  const chains = new DeFiLlamaChainProvider();
  const prestocks = new PreStocksProvider(config.PRESTOCKS_BASE_URL);
  const xstocks = new XStocksClient();
  const pyth = new PythProProvider(config.PYTH_PRO_API_KEY ?? "");
  const solanaRpcUrl =
    config.SOLANA_RPC_URL ??
    (config.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${config.HELIUS_API_KEY}`
      : null);
  const helius = solanaRpcUrl ? new HeliusClient(solanaRpcUrl) : null;
  const clawpump = config.CLAWPUMP_API_KEY ? new ClawpumpClient(config.CLAWPUMP_API_KEY) : null;
  const jupiter = config.JUPITER_API_KEY ? new JupiterQuoteClient(config.JUPITER_API_KEY) : null;
  const solanaTrading = new SolanaTradingService(config, xstocks, prestocks, helius, jupiter);
  const stockNews = new StockNewsClient(
    config.GNEWS_API_KEY,
    config.FINNHUB_API_KEY,
    config.MARKETAUX_API_KEY,
  );
  const research =
    config.OPENROUTER_API_KEY && config.SISERA_INTELLIGENCE_MODEL
      ? new OpenRouterResearchClient(config.OPENROUTER_API_KEY, config.SISERA_INTELLIGENCE_MODEL)
      : null;
  const marketProvider = (venue: string) => (venue === "hyperliquid" ? hyperliquid : marketData);
  const predictions =
    dependencies.predictions ?? new PolymarketProvider(config.POLYMARKET_GAMMA_BASE_URL);
  const referenceMarkets = new CoinGeckoReferenceProvider();
  const requestStarts = new WeakMap<object, number>();

  await app.register(helmet);
  await app.register(cors, { origin: false });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  app.decorateRequest("principal", null);
  app.addHook("onRequest", createAuthenticator(config));
  app.addHook("onRequest", async (request) => {
    requestStarts.set(request, performance.now());
  });
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? "unknown";
    requestCount.inc({ method: request.method, route, status: reply.statusCode });
    const startedAt = requestStarts.get(request);
    if (startedAt)
      requestDuration.observe(
        { method: request.method, route },
        (performance.now() - startedAt) / 1000,
      );
  });

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async () => ({ status: "ready", dependencies: { process: "ok" } }));
  app.post("/v1/helius/webhook", async (request, reply) => {
    if (!validWebhookSecret(request.headers.authorization, config.HELIUS_WEBHOOK_SECRET))
      return reply.code(401).send({ error: "unauthorized" });
    if (!config.DATABASE_URL)
      return reply
        .code(503)
        .send({ error: "identity_store_unavailable", message: "Event database is not configured" });
    const events = parseHeliusWebhook(request.body);
    const inserted = await recordSolanaWebhookEvents(config.DATABASE_URL, events);
    return { accepted: events.length, inserted, status: "observation_only" };
  });
  app.get("/v1/private-markets", { preHandler: requirePermission("market:read") }, async () => ({
    data: await prestocks.list(),
  }));
  app.get("/v1/public-stocks", { preHandler: requirePermission("market:read") }, async () => ({
    data: await xstocks.list(),
  }));
  app.get(
    "/v1/stocks/:symbol/news",
    { preHandler: requirePermission("market:read") },
    async (request, reply) => {
      const { symbol } = z
        .object({ symbol: z.string().regex(/^[A-Za-z0-9-]{1,20}$/) })
        .parse(request.params);
      const asset = (await prestocks.list()).find(
        (item) => item.instrument.baseAsset.toLowerCase() === symbol.toLowerCase(),
      );
      const publicStock = asset
        ? null
        : (await xstocks.list()).find((item) => item.symbol.toLowerCase() === symbol.toLowerCase());
      if (!asset && !publicStock)
        return reply.code(404).send({ error: "not_found", message: "Unknown stock" });
      const result = await stockNews.search(
        asset?.company ?? publicStock?.name ?? symbol,
        publicStock?.underlyingSymbol,
      );
      return { ...result, delayedPossible: true };
    },
  );
  app.post(
    "/v1/stocks/:symbol/assessment",
    {
      preHandler: requirePermission("market:read"),
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      if (!research)
        return reply.code(503).send({
          error: "provider_unavailable",
          message: "Sisera research model is not configured",
        });
      const { symbol } = z
        .object({ symbol: z.string().regex(/^[A-Za-z0-9-]{1,20}$/) })
        .parse(request.params);
      const asset = (await prestocks.list()).find(
        (item) => item.instrument.baseAsset.toLowerCase() === symbol.toLowerCase(),
      );
      if (!asset)
        return reply.code(404).send({ error: "not_found", message: "Unknown PreStocks asset" });
      const news = await stockNews.search(asset.company).catch(() => ({ data: [], providers: [] }));
      const assessment = await research.assess({
        company: asset.company,
        symbol: asset.instrument.baseAsset,
        tokenPrice: asset.tokenPrice,
        markPrice: asset.markPrice,
        premiumDiscountPct: asset.premiumDiscountPct,
        fetchedAt: asset.fetchedAt,
        articles: news.data.slice(0, 5).map((item) => ({
          title: item.title,
          publishedAt: item.publishedAt,
          publisher: item.publisher,
        })),
      });
      return {
        data: assessment,
        provenance: {
          market: asset.source,
          news: news.providers,
          model: config.SISERA_INTELLIGENCE_MODEL,
        },
        executable: false,
      };
    },
  );
  app.get(
    "/v1/clawpump/search",
    { preHandler: requirePermission("market:read") },
    async (request, reply) => {
      const { query } = z.object({ query: z.string().trim().min(2).max(80) }).parse(request.query);
      if (!clawpump)
        return reply.code(503).send({
          error: "provider_unavailable",
          message: "Clawpump partner API is not configured",
        });
      return { data: await clawpump.search(query), source: "clawpump" };
    },
  );
  app.get(
    "/v1/clawpump/price/:mint",
    { preHandler: requirePermission("market:read") },
    async (request, reply) => {
      const { mint } = z
        .object({ mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) })
        .parse(request.params);
      if (!clawpump)
        return reply.code(503).send({
          error: "provider_unavailable",
          message: "Clawpump partner API is not configured",
        });
      return { data: await clawpump.price(mint) };
    },
  );
  app.get(
    "/v1/clawpump/pairs",
    { preHandler: requirePermission("market:read") },
    async (_request, reply) => {
      if (!clawpump)
        return reply.code(503).send({
          error: "provider_unavailable",
          message: "Clawpump partner API is not configured",
        });
      return { data: await clawpump.pairs() };
    },
  );
  app.get(
    "/v1/solana/quote",
    { preHandler: requirePermission("market:read") },
    async (request, reply) => {
      const mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
      const { inputMint, outputMint, amount } = z
        .object({
          inputMint: mint,
          outputMint: mint,
          amount: z.string().regex(/^[1-9][0-9]{0,18}$/),
        })
        .parse(request.query);
      if (!jupiter)
        return reply
          .code(503)
          .send({ error: "provider_unavailable", message: "Jupiter API is not configured" });
      return { data: await jupiter.preview(inputMint, outputMint, amount) };
    },
  );
  app.post(
    "/v1/solana/orders/prepare",
    {
      preHandler: requirePermission("order:live:create"),
      config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal?.subject.startsWith("privy:"))
        return reply.code(403).send({ error: "account_required" });
      const input = z
        .object({
          wallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
          mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
          side: z.enum(["buy", "sell"]),
          amount: z.string().regex(/^[1-9][0-9]{0,18}$/),
        })
        .parse(request.body);
      return {
        data: await solanaTrading.prepare({
          ...input,
          subject: principal.subject,
          tenantId: principal.tenantId,
        }),
      };
    },
  );
  app.post(
    "/v1/solana/orders/paper",
    {
      preHandler: requirePermission("order:paper:create"),
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request) => {
      const principal = request.principal;
      if (!principal) throw new TradeRejection("Sign in to trade.", 401);
      const input = z
        .object({
          mint: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
          side: z.enum(["buy", "sell"]),
          amount: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/),
        })
        .parse(request.body);
      return {
        data: await solanaTrading.paper({
          ...input,
          subject: principal.subject,
          tenantId: principal.tenantId,
        }),
      };
    },
  );
  app.post(
    "/v1/solana/orders/:id/execute",
    {
      preHandler: requirePermission("order:live:create"),
      config: { rateLimit: { max: 8, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal?.subject.startsWith("privy:"))
        return reply.code(403).send({ error: "account_required" });
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { signedTransaction } = z
        .object({ signedTransaction: z.string().min(40).max(5000) })
        .parse(request.body);
      return { data: await solanaTrading.execute(id, principal.subject, signedTransaction) };
    },
  );
  app.get(
    "/v1/solana/orders",
    { preHandler: requirePermission("portfolio:read") },
    async (request) => ({
      data:
        config.DATABASE_URL && request.principal
          ? await listSolanaSwapOrders(config.DATABASE_URL, request.principal.subject)
          : [],
    }),
  );
  app.get(
    "/v1/pyth/reference",
    { preHandler: requirePermission("market:read") },
    async (request, reply) => {
      const { symbol } = z
        .object({ symbol: z.string().regex(/^[A-Za-z0-9./_-]{5,80}$/) })
        .parse(request.query);
      if (!config.PYTH_PRO_API_KEY)
        return reply
          .code(503)
          .send({ error: "provider_unavailable", message: "Pyth Pro is not configured" });
      return { data: await pyth.getLatest(symbol) };
    },
  );
  app.get(
    "/v1/solana/wallet/:address",
    { preHandler: requirePermission("portfolio:read") },
    async (request, reply) => {
      const { address } = z
        .object({ address: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/) })
        .parse(request.params);
      if (!helius)
        return reply
          .code(503)
          .send({ error: "provider_unavailable", message: "Helius RPC is not configured" });
      return { data: await helius.getWallet(address) };
    },
  );
  app.get("/metrics", async (_request, reply) =>
    reply.type(registry.contentType).send(await registry.metrics()),
  );

  app.get("/v1/markets", { preHandler: requirePermission("market:read") }, async (request) => {
    const { symbols, venue } = z
      .object({
        symbols: z.string().default("BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT"),
        venue: z.enum(["binance", "hyperliquid"]).default("binance"),
      })
      .parse(request.query);
    const provider = marketProvider(venue);
    const requested = [
      ...new Set(
        symbols
          .split(",")
          .map((symbol) => symbol.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);
    if (provider.listMarkets) {
      try {
        const data = await provider.listMarkets(requested);
        const available = new Set(data.map((row) => row.instrument.baseAsset));
        return {
          data,
          unavailable: requested
            .filter((symbol) => !available.has(symbol.replace(/USDT$|USDC$/, "")))
            .map((symbol) => ({ symbol, reason: "provider_unavailable" })),
        };
      } catch {
        return {
          data: [],
          unavailable: requested.map((symbol) => ({ symbol, reason: "provider_unavailable" })),
        };
      }
    }
    const results = await Promise.allSettled(
      requested.map(async (symbol) => {
        const [instrument, snapshot] = await Promise.all([
          provider.getInstrument(symbol),
          provider.getSnapshot(symbol),
        ]);
        return { instrument, snapshot };
      }),
    );
    return {
      data: results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
      unavailable: results.flatMap((result, index) =>
        result.status === "rejected"
          ? [{ symbol: requested[index], reason: "provider_unavailable" }]
          : [],
      ),
    };
  });

  app.get(
    "/v1/reference-markets",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { symbols } = z.object({ symbols: z.string().max(200) }).parse(request.query);
      return { data: await referenceMarkets.list(symbols.split(",").slice(0, 20)) };
    },
  );

  app.get(
    "/v1/markets/:symbol",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { symbol } = z.object({ symbol: z.string().min(5).max(20) }).parse(request.params);
      const { venue } = z
        .object({ venue: z.enum(["binance", "hyperliquid"]).default("binance") })
        .parse(request.query);
      const provider = marketProvider(venue);
      const [instrument, snapshot] = await Promise.all([
        provider.getInstrument(symbol),
        provider.getSnapshot(symbol),
      ]);
      return { instrument, snapshot };
    },
  );

  app.get(
    "/v1/markets/:symbol/candles",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { venue, interval, limit } = z
        .object({
          venue: z.enum(["binance", "hyperliquid"]).default("binance"),
          interval: z.string().default("15m"),
          limit: z.coerce.number().int().min(30).max(1000).default(240),
        })
        .parse(request.query);
      const provider = marketProvider(venue);
      if (!provider.getCandles) throw new MarketDataUnavailableError("Candle adapter unavailable");
      const { symbol } = z.object({ symbol: z.string().min(5).max(20) }).parse(request.params);
      return { data: await provider.getCandles(symbol, interval, limit), interval };
    },
  );

  app.get(
    "/v1/markets/:symbol/depth",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { venue, limit } = z
        .object({
          venue: z.enum(["binance", "hyperliquid"]).default("binance"),
          limit: z.coerce.number().int().min(5).max(100).default(20),
        })
        .parse(request.query);
      const provider = marketProvider(venue);
      if (!provider.getOrderBook) throw new MarketDataUnavailableError("Depth adapter unavailable");
      const { symbol } = z.object({ symbol: z.string().min(5).max(20) }).parse(request.params);
      return { data: await provider.getOrderBook(symbol, limit) };
    },
  );

  app.get(
    "/v1/markets/:symbol/intelligence",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { venue } = z
        .object({ venue: z.enum(["binance", "hyperliquid"]).default("binance") })
        .parse(request.query);
      const provider = marketProvider(venue);
      if (!provider.getCandles) throw new MarketDataUnavailableError("Candle adapter unavailable");
      const { symbol } = z.object({ symbol: z.string().min(5).max(20) }).parse(request.params);
      const candles = await provider.getCandles(symbol, "1h", 240);
      return { data: analyzeCandles(candles) };
    },
  );

  app.get(
    "/v1/perpetual-metrics",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { symbols } = z
        .object({ symbols: z.string().default("BTC,ETH,SOL,HYPE,AVAX") })
        .parse(request.query);
      return { data: await hyperliquid.listPerpetualMetrics(symbols.split(",").slice(0, 20)) };
    },
  );

  app.get("/v1/chains", { preHandler: requirePermission("market:read") }, async (request) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(request.query);
    return { data: await chains.listChains(limit) };
  });

  app.get(
    "/v1/public-wallet/:address",
    { preHandler: requirePermission("portfolio:read") },
    async (request) => {
      const { address } = z
        .object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) })
        .parse(request.params);
      return { data: await hyperliquid.getPublicAccount(address) };
    },
  );

  app.get(
    "/v1/prediction-markets",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { limit } = z
        .object({ limit: z.coerce.number().int().min(1).max(100).default(20) })
        .parse(request.query);
      return { data: await predictions.listOpenMarkets(limit) };
    },
  );

  app.post(
    "/v1/copilot/compile",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(request.body);
      return { intent: compileIntent(text), executable: false };
    },
  );

  app.post(
    "/v1/orders/paper",
    { preHandler: requirePermission("order:paper:create") },
    async (request, reply) => {
      const order = OrderIntent.parse(request.body);
      if (!order.instrumentId.startsWith("binance:") || !order.instrumentId.endsWith(":spot")) {
        return reply.code(422).send({
          error: "unsupported_paper_venue",
          message: "Paper execution currently supports only Binance spot instruments.",
        });
      }
      const context = await dependencies.loadRiskContext?.(order.portfolioId);
      if (!context) {
        return reply.code(503).send({
          error: "risk_context_unavailable",
          message: "Portfolio and mandate state must be available before order evaluation.",
        });
      }
      const [instrument, quote] = await Promise.all([
        marketData.getInstrument(order.instrumentId.split(":")[1] ?? order.instrumentId),
        marketData.getSnapshot(order.instrumentId.split(":")[1] ?? order.instrumentId),
      ]);
      const riskDecision = evaluatePreTradeRisk({ order, instrument, quote, ...context });
      let record = createOrderRecord(crypto.randomUUID(), order);
      record = applyOrderEvent(record, {
        type: "risk_evaluated",
        decision: riskDecision,
        at: riskDecision.checkedAt,
      });
      if (riskDecision.outcome === "rejected")
        return reply.code(422).send({ order: record, riskDecision });
      record = applyOrderEvent(record, { type: "routed", at: new Date().toISOString() });
      const fillPrice = order.side === "buy" ? quote.ask : quote.bid;
      record = applyOrderEvent(record, {
        type: "filled",
        quantity: order.quantity,
        price: fillPrice,
        at: new Date().toISOString(),
      });
      return reply.code(201).send({ order: record, riskDecision, quote });
    },
  );

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "request failed");
    if (error instanceof z.ZodError) {
      return reply
        .code(400)
        .send({ error: "validation_error", issues: error.issues, requestId: request.id });
    }
    if (error instanceof TradeRejection) {
      return reply
        .code(error.statusCode)
        .send({ error: "trade_unavailable", message: error.message });
    }
    if (error instanceof MarketDataUnavailableError) {
      return reply
        .code(503)
        .send({ error: error.code, message: error.message, requestId: request.id });
    }
    return reply.code(500).send({
      error: "internal_error",
      message: "The request could not be completed.",
      requestId: request.id,
    });
  });

  return app;
}
