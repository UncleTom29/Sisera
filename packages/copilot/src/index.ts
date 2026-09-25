import { z } from "zod";

export const CompiledIntent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("order_draft"),
    side: z.enum(["buy", "sell"]),
    quantity: z.string(),
    symbol: z.string(),
    orderType: z.enum(["market", "limit"]),
    limitPrice: z.string().optional(),
    requiresConfirmation: z.literal(true),
    sourceText: z.string(),
  }),
  z.object({
    kind: z.literal("research_query"),
    topic: z.string(),
    requiresConfirmation: z.literal(false),
    sourceText: z.string(),
  }),
]);
export type CompiledIntent = z.infer<typeof CompiledIntent>;

export function compileIntent(sourceText: string): CompiledIntent {
  const normalized = sourceText.trim().replaceAll(/\s+/g, " ");
  if (!normalized) throw new Error("Intent cannot be empty");

  const order = normalized.match(
    /^(buy|sell)\s+([0-9]+(?:\.[0-9]+)?)\s+([a-z0-9/_-]+)(?:\s+(?:at|limit)\s+([0-9]+(?:\.[0-9]+)?))?$/i,
  );
  if (!order) {
    return { kind: "research_query", topic: normalized, requiresConfirmation: false, sourceText };
  }
  const [, side, quantity, symbol, limitPrice] = order;
  if (!side || !quantity || !symbol) throw new Error("Incomplete order intent");
  return {
    kind: "order_draft",
    side: side.toLowerCase() as "buy" | "sell",
    quantity,
    symbol: symbol.replaceAll(/[\s/_-]/g, "").toUpperCase(),
    orderType: limitPrice ? "limit" : "market",
    ...(limitPrice ? { limitPrice } : {}),
    requiresConfirmation: true,
    sourceText,
  };
}
