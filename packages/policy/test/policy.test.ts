import type { Candle } from "@sisera/domain";
import { describe, expect, it } from "vitest";
import {
  type InstrumentRef,
  compilePolicyText,
  evaluateCondition,
  evaluatePolicy,
  parseClause,
  validatePolicy,
} from "../src/index.js";

const now = Date.parse("2026-09-29T12:00:00Z");
const openai: InstrumentRef = { kind: "pre_ipo", symbol: "OPENAI", name: "OpenAI" };
const resolveInstrument = (text: string) => (/openai/i.test(text) ? openai : null);

describe("policy compiler", () => {
  it("compiles the canonical conversational request", () => {
    const result = compilePolicyText(
      "Buy $2,000 if the premium falls below 3%, liquidity remains above my threshold, and no high-severity negative event appears.",
      { resolveInstrument, contextInstrument: openai, defaultLiquidityThresholdUsd: 400_000, now },
    );
    expect(result.errors).toEqual([]);
    expect(result.policy?.action).toEqual({ side: "buy", notionalUsd: 2000, mode: "paper" });
    expect(result.policy?.triggers).toEqual([
      { type: "premium_below", pct: 3 },
      { type: "liquidity_above", usd: 400_000 },
      { type: "no_negative_event", minSeverity: "high", lookbackHours: 24, includeRumors: true },
    ]);
    expect(result.policy?.execution.requireApproval).toBe(true);
  });

  it("parses invalidations, expiry and execution options", () => {
    const result = compilePolicyText(
      "Buy $1.5k of OpenAI within 3 days when the discount widens beyond 5% and volume above $250k, automatically, slippage under 50 bps. Cancel if price below $100",
      { resolveInstrument, now },
    );
    expect(result.errors).toEqual([]);
    expect(result.policy?.action.notionalUsd).toBe(1500);
    expect(result.policy?.triggers).toContainEqual({ type: "premium_below", pct: -5 });
    expect(result.policy?.triggers).toContainEqual({ type: "volume_24h_above", usd: 250_000 });
    expect(result.policy?.invalidation.conditions).toEqual([{ type: "price_below", usd: 100 }]);
    expect(result.policy?.execution).toEqual({ maxSlippageBps: 50, requireApproval: false });
    expect(Date.parse(result.policy?.invalidation.expiresAt ?? "")).toBe(now + 3 * 86_400_000);
  });

  it("refuses to guess unknown conditions or missing amounts", () => {
    const unknown = compilePolicyText("Buy $500 of OpenAI if the vibes are good", {
      resolveInstrument,
      now,
    });
    expect(unknown.policy).toBeNull();
    expect(unknown.unparsed).toEqual(["the vibes are good"]);
    const noAmount = compilePolicyText("Buy OpenAI if premium below 2%", {
      resolveInstrument,
      now,
    });
    expect(noAmount.policy).toBeNull();
  });

  it("adds an event guard to live policies", () => {
    const result = compilePolicyText("Buy $100 of OpenAI live if premium below 1%", {
      resolveInstrument,
      now,
    });
    expect(result.policy?.action.mode).toBe("live");
    expect(result.policy?.triggers.some((c) => c.type === "no_negative_event")).toBe(true);
    expect(
      validatePolicy(result.policy as NonNullable<typeof result.policy>, {
        maxNotionalUsd: 500,
        liveAvailable: false,
        now,
      }),
    ).toContain("Live execution is not enabled for this account or venue; use paper mode.");
  });

  it("parses common clause forms", () => {
    expect(parseClause("RSI(14) drops below 30", {})).toEqual({
      type: "rsi_below",
      period: 14,
      value: 30,
    });
    expect(parseClause("it trades 4% below its mark", {})).toEqual({
      type: "premium_below",
      pct: -4,
    });
    expect(parseClause("down more than 5% today", {})).toEqual({
      type: "change_24h_below",
      pct: -5,
    });
    expect(parseClause("no critical negative news in the last 2 days", {})).toEqual({
      type: "no_negative_event",
      minSeverity: "critical",
      lookbackHours: 48,
      includeRumors: true,
    });
  });
});

describe("policy evaluation", () => {
  const policy = compilePolicyText(
    "Buy $2000 of OpenAI if premium below 3%, liquidity above $100k, no high severity negative event. Cancel if premium above 20%",
    { resolveInstrument, now },
  ).policy as NonNullable<ReturnType<typeof compilePolicyText>["policy"]>;

  it("fails closed on missing data", () => {
    const evaluation = evaluatePolicy(policy, { premiumPct: 1 }, now);
    expect(evaluation.status).toBe("waiting");
    expect(
      evaluation.triggers.find((r) => r.condition.type === "liquidity_above")?.dataAvailable,
    ).toBe(false);
  });

  it("triggers, invalidates and expires", () => {
    expect(
      evaluatePolicy(policy, { premiumPct: 1, liquidityUsd: 200_000, events: [] }, now).status,
    ).toBe("triggered");
    expect(
      evaluatePolicy(
        policy,
        {
          premiumPct: 1,
          liquidityUsd: 200_000,
          events: [
            {
              severity: "high",
              sentiment: "negative",
              certainty: "corroborated",
              lastSeenAt: new Date(now - 3_600_000).toISOString(),
              headline: "Probe",
            },
          ],
        },
        now,
      ).status,
    ).toBe("waiting");
    expect(
      evaluatePolicy(policy, { premiumPct: 25, liquidityUsd: 200_000, events: [] }, now).status,
    ).toBe("invalidated");
    expect(evaluatePolicy(policy, { premiumPct: 1 }, now + 30 * 86_400_000).status).toBe("expired");
  });

  it("evaluates technical conditions from candles", () => {
    const candles: Candle[] = Array.from({ length: 60 }, (_, index) => ({
      time: 1_700_000_000 + index * 3600,
      open: String(100 + index),
      high: String(101 + index),
      low: String(99 + index),
      close: String(100 + index),
      volume: String(index === 59 ? 500 : 100),
    }));
    expect(
      evaluateCondition(
        { type: "ema_trend", fast: 12, slow: 26, direction: "bullish", requireCross: false },
        { candles },
      ).passed,
    ).toBe(true);
    expect(evaluateCondition({ type: "breakout_high", lookback: 20 }, { candles }).passed).toBe(
      false,
    );
    expect(
      evaluateCondition({ type: "relative_volume_above", lookback: 20, ratio: 3 }, { candles })
        .passed,
    ).toBe(true);
    expect(
      evaluateCondition({ type: "rsi_above", period: 14, value: 70 }, { candles }).passed,
    ).toBe(true);
  });
});
