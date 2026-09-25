import { z } from "zod";

const Token = z
  .object({
    mint: z.string().optional(),
    address: z.string().optional(),
    symbol: z.string(),
    name: z.string(),
    verified: z.boolean().optional(),
    price: z.union([z.string(), z.number()]).nullable().optional(),
    marketCap: z.union([z.string(), z.number()]).nullable().optional(),
    liquidity: z.union([z.string(), z.number()]).nullable().optional(),
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
  price: z.union([z.string(), z.number()]).nullable(),
  currency: z.string().optional(),
  change24h: z.union([z.string(), z.number()]).nullable().optional(),
  volume24h: z.union([z.string(), z.number()]).nullable().optional(),
  marketCap: z.union([z.string(), z.number()]).nullable().optional(),
  liquidity: z.union([z.string(), z.number()]).nullable().optional(),
  source: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});

export class ClawpumpClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey.startsWith("cpk_")) throw new Error("Clawpump partner key is invalid");
  }

  private async get(path: string, query: Record<string, string> = {}) {
    const url = new URL(`https://clawpump.tech/api/v1/${path}`);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Clawpump returned ${response.status}`);
    return response.json();
  }

  async search(query: string) {
    return SearchResponse.parse(await this.get("tokens/search", { query, limit: "20" }));
  }
  async price(mint: string) {
    return PriceResponse.parse(await this.get("price", { mint }));
  }
  async pairs() {
    return z
      .object({
        assets: z.array(
          z.object({
            mint: z.string(),
            symbol: z.string(),
            name: z.string(),
            decimals: z.number(),
          }),
        ),
        creatorFeeBps: z.object({ min: z.number(), max: z.number(), default: z.number() }),
      })
      .parse(await this.get("pump-pairs"));
  }
}
