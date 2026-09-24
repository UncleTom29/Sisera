import { z } from "zod";

const Environment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().default("sisera-api"),
  SISERA_ALLOW_DEV_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  BINANCE_SPOT_BASE_URL: z.string().url().default("https://api.binance.com"),
  POLYMARKET_GAMMA_BASE_URL: z.string().url().default("https://gamma-api.polymarket.com"),
});

export type ApiConfig = z.infer<typeof Environment>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return Environment.parse(environment);
}
