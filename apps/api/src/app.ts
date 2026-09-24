import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { compileIntent } from "@sisera/copilot";
import { OrderIntent, type PortfolioRiskState, type RiskLimits } from "@sisera/domain";
import type { Instrument, MarketSnapshot } from "@sisera/domain";
import {
  BinanceSpotProvider,
  MarketDataUnavailableError,
  PolymarketProvider,
} from "@sisera/market-data";
import { applyOrderEvent, createOrderRecord } from "@sisera/oms";
import { evaluatePreTradeRisk } from "@sisera/risk";
import Fastify from "fastify";
import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { z } from "zod";
import { createAuthenticator, requirePermission } from "./auth.js";
import type { ApiConfig } from "./config.js";

export type RiskContext = {
  portfolio: z.infer<typeof PortfolioRiskState>;
  limits: z.infer<typeof RiskLimits>;
};

export type ApiDependencies = {
  marketData?: {
    getInstrument(symbol: string): Promise<Instrument>;
    getSnapshot(symbol: string): Promise<MarketSnapshot>;
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
  const predictions =
    dependencies.predictions ?? new PolymarketProvider(config.POLYMARKET_GAMMA_BASE_URL);
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
  app.get("/metrics", async (_request, reply) =>
    reply.type(registry.contentType).send(await registry.metrics()),
  );

  app.get(
    "/v1/markets/:symbol",
    { preHandler: requirePermission("market:read") },
    async (request) => {
      const { symbol } = z.object({ symbol: z.string().min(5).max(20) }).parse(request.params);
      const [instrument, snapshot] = await Promise.all([
        marketData.getInstrument(symbol),
        marketData.getSnapshot(symbol),
      ]);
      return { instrument, snapshot };
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
