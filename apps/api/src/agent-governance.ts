import { createHash } from "node:crypto";
import { z } from "zod";

export const AgentDraftInput = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(20).max(1000),
    universe: z
      .array(z.string().regex(/^[A-Za-z0-9:*\/_-]{2,40}$/))
      .min(1)
      .max(12),
    timeframe: z.enum(["5m", "15m", "1h", "4h", "1d", "event"]),
    factors: z.array(z.string().trim().min(3).max(120)).min(1).max(8),
    capitalLimitUsd: z.coerce.number().positive().max(1_000_000),
    maxTradeNotionalUsd: z.coerce.number().positive().max(100_000),
    maxDailyDrawdownPct: z.coerce.number().positive().max(10),
    maxOpenPositions: z.coerce.number().int().positive().max(20),
    stopLossPct: z.coerce.number().positive().max(30),
    takeProfitPct: z.coerce.number().positive().max(100),
    maxSlippageBps: z.coerce.number().nonnegative().max(500),
  })
  .strict()
  .refine((value) => value.maxTradeNotionalUsd <= value.capitalLimitUsd, {
    message: "Trade notional cannot exceed capital allocation",
    path: ["maxTradeNotionalUsd"],
  });

export type AgentDraftInput = z.infer<typeof AgentDraftInput>;

export function compileAgentDraft(input: AgentDraftInput) {
  const policy = {
    description: input.description,
    universe: input.universe,
    timeframe: input.timeframe,
    factors: input.factors,
    capitalAllocation: {
      maxCapitalUsd: input.capitalLimitUsd,
      maxTradeNotionalUsd: input.maxTradeNotionalUsd,
      maxLeverage: 1,
    },
    riskGuardrails: {
      maxDailyDrawdownPct: input.maxDailyDrawdownPct,
      maxOpenPositions: input.maxOpenPositions,
      stopLossPct: input.stopLossPct,
      takeProfitPct: input.takeProfitPct,
      killSwitchAction: "CANCEL_ALL_AND_HALT",
    },
    execution: { maxSlippageBps: input.maxSlippageBps, proposalOnly: true },
    sandboxRequirements: { maxCpuMs: 1_000, maxMemoryMb: 128, networkAccess: false },
    lifecycle: ["draft", "backtest", "stress_test", "paper", "shadow", "limited_live", "live"],
  };
  return {
    policy,
    manifestHash: createHash("sha256").update(JSON.stringify(policy)).digest("hex"),
  };
}
