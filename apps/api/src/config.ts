import { z } from "zod";

const Environment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  SISERA_ALLOW_DEV_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BINANCE_SPOT_BASE_URL: z.string().url().default("https://data-api.binance.vision"),
  HYPERLIQUID_BASE_URL: z.string().url().default("https://api.hyperliquid.xyz"),
  POLYMARKET_GAMMA_BASE_URL: z.string().url().default("https://gamma-api.polymarket.com"),
  PRESTOCKS_BASE_URL: z.string().url().default("https://prestocks.com"),
  PYTH_PRO_API_KEY: z.string().optional(),
  HELIUS_API_KEY: z.string().optional(),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),
  SOLANA_RPC_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  JUPITER_API_KEY: z.string().optional(),
  CLAWPUMP_API_KEY: z.string().optional(),
  GNEWS_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  MARKETAUX_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  SISERA_INTELLIGENCE_MODEL: z.string().optional(),
});

export type ApiConfig = z.infer<typeof Environment>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return Environment.parse(environment);
}
