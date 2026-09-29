import { createHash } from "node:crypto";
import {
  type PolicyRow,
  createTradingPolicy,
  getRiskPreferences,
  getTradingPolicy,
  listSchedulablePolicies,
  listTradingPolicies,
  recordPolicyEvaluation,
  transitionTradingPolicy,
} from "@sisera/db";
import {
  type CompileResult,
  TradingPolicy,
  compilePolicyText,
  describePolicy,
  evaluatePolicy,
  validatePolicy,
} from "@sisera/policy";
import type { FastifyBaseLogger } from "fastify";
import type { HeliusClient } from "../helius.js";
import { type SolanaTradingService, TradeRejection } from "../solana-trading.js";
import { AssetCatalog, type CatalogAsset } from "./catalog.js";
import type { DelegatedSigner } from "./delegated-signer.js";
import type { MarketStateBuilder } from "./market-state.js";
import type { PortfolioService } from "./portfolio-service.js";

export class PolicyError extends Error {
  constructor(
    message: string,
    readonly statusCode = 422,
  ) {
    super(message);
  }
}

export type PolicyDependencies = {
  databaseUrl: string;
  catalog: AssetCatalog;
  states: MarketStateBuilder;
  portfolio: PortfolioService;
  trading: SolanaTradingService;
  helius: HeliusClient;
  signer: DelegatedSigner;
  liveAvailable: boolean;
  /** Optional language-model rewrite of free text into the policy grammar. */
  rewrite?: (text: string, assetHint: string | null) => Promise<string | null>;
  log: FastifyBaseLogger;
};

const MAX_LIVE_NOTIONAL_USD = 500;
const MAX_PAPER_NOTIONAL_USD = 10_000;

export const hashPolicy = (policy: unknown) =>
  createHash("sha256").update(JSON.stringify(policy)).digest("hex");

/**
 * Turns conversational instructions into deterministic, auditable trading policies. A language
 * model may only rephrase text into Sisera's policy grammar; the compiled policy, its validation,
 * its evaluation and every execution decision are deterministic and risk-checked.
 */
export class PolicyService {
  constructor(private readonly deps: PolicyDependencies) {}

  async compile(
    subject: string,
    text: string,
    context: { assetKey?: string | null; mode?: "paper" | "live" },
  ) {
    const [preferences, contextAsset] = await Promise.all([
      getRiskPreferences(this.deps.databaseUrl, subject).catch(() => ({
        liquidityThresholdUsd: 250_000,
        mandate: {},
      })),
      context.assetKey ? this.deps.catalog.byKey(context.assetKey) : Promise.resolve(null),
    ]);
    const resolved = new Map<string, CatalogAsset>();
    const mentioned = await this.deps.catalog.resolveText(text).catch(() => null);
    if (mentioned) resolved.set(mentioned.mint, mentioned);
    if (contextAsset) resolved.set(contextAsset.mint, contextAsset);
    const compileWith = (input: string): CompileResult =>
      compilePolicyText(input, {
        resolveInstrument: (fragment) => {
          const hit = [...resolved.values()].find(
            (asset) =>
              new RegExp(`\\b${asset.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
                fragment,
              ) ||
              fragment.toLowerCase().includes(
                asset.name
                  .toLowerCase()
                  .replace(/\bxstock\b/, "")
                  .trim(),
              ) ||
              fragment.includes(asset.mint),
          );
          return hit ? AssetCatalog.toInstrumentRef(hit) : null;
        },
        contextInstrument:
          (mentioned ?? contextAsset)
            ? AssetCatalog.toInstrumentRef((mentioned ?? contextAsset) as CatalogAsset)
            : null,
        defaultLiquidityThresholdUsd: preferences.liquidityThresholdUsd,
        defaultMode: context.mode ?? "paper",
      });
    let result = compileWith(text);
    let rewritten: string | null = null;
    if (!result.policy && this.deps.rewrite && (result.unparsed.length || !result.parsed.length)) {
      rewritten = await this.deps
        .rewrite(text, (mentioned ?? contextAsset)?.symbol ?? null)
        .catch(() => null);
      if (rewritten) {
        const second = compileWith(rewritten);
        if (second.policy || second.errors.length < result.errors.length) result = second;
      }
    }
    if (!result.policy)
      return {
        policy: null,
        compile: result,
        rewritten,
        asset: null,
        validation: result.errors,
        evaluation: null,
        impact: null,
        description: null,
      };
    const policy = result.policy;
    const asset =
      [...resolved.values()].find((candidate) => candidate.mint === policy.instrument.mint) ?? null;
    const validation = validatePolicy(policy, {
      maxNotionalUsd:
        policy.action.mode === "live" ? MAX_LIVE_NOTIONAL_USD : MAX_PAPER_NOTIONAL_USD,
      liveAvailable: this.deps.liveAvailable,
    });
    if (
      policy.action.mode === "live" &&
      !policy.execution.requireApproval &&
      !this.deps.signer.available
    )
      validation.push(
        "Automatic live execution needs delegated signing, which is not enabled; the policy will ask for your approval instead.",
      );
    const [evaluation, impact] = asset
      ? await Promise.all([
          this.deps.states
            .build(asset, [...policy.triggers, ...policy.invalidation.conditions])
            .then(({ state, snapshot }) => ({ ...evaluatePolicy(policy, state), snapshot }))
            .catch(() => null),
          this.deps.portfolio
            .impact(subject, policy.action.mode, {
              asset,
              side: policy.action.side,
              notionalUsd: policy.action.notionalUsd,
            })
            .catch(() => null),
        ])
      : [null, null];
    return {
      policy,
      compile: result,
      rewritten,
      asset,
      validation,
      evaluation,
      impact,
      description: describePolicy(policy),
    };
  }

  async create(
    principal: { subject: string; tenantId: string },
    input: { policy: unknown; activate: boolean; wallet?: string | null; source?: string },
  ) {
    const policy = TradingPolicy.parse(input.policy);
    if (
      policy.action.mode === "live" &&
      !policy.execution.requireApproval &&
      !this.deps.signer.available
    )
      policy.execution.requireApproval = true;
    const errors = validatePolicy(policy, {
      maxNotionalUsd:
        policy.action.mode === "live" ? MAX_LIVE_NOTIONAL_USD : MAX_PAPER_NOTIONAL_USD,
      liveAvailable: this.deps.liveAvailable,
    });
    if (errors.length) throw new PolicyError(errors.join(" "));
    if (policy.action.mode === "live" && !input.wallet)
      throw new PolicyError("Choose the wallet a live policy trades from.");
    const asset = policy.instrument.mint
      ? await this.deps.catalog.byMint(policy.instrument.mint)
      : null;
    if (!asset) throw new PolicyError("The policy's asset is no longer available.");
    const row = await createTradingPolicy(this.deps.databaseUrl, {
      tenantId: principal.tenantId,
      subject: principal.subject,
      name: policy.name,
      policy,
      policyHash: hashPolicy(policy),
      mode: policy.action.mode,
      status: input.activate ? "active" : "draft",
      source: input.source ?? "copilot",
    });
    if (input.wallet)
      return (
        (await transitionTradingPolicy(this.deps.databaseUrl, row.id, [row.status], row.status, {
          execution: { wallet: input.wallet },
        })) ?? row
      );
    return row;
  }

  list(subject: string) {
    return listTradingPolicies(this.deps.databaseUrl, subject);
  }

  async activate(subject: string, id: string) {
    const row = await transitionTradingPolicy(this.deps.databaseUrl, id, ["draft"], "active", {
      subject,
    });
    if (!row) throw new PolicyError("Only draft policies can be activated.", 409);
    return row;
  }

  async cancel(subject: string, id: string) {
    const row = await transitionTradingPolicy(
      this.deps.databaseUrl,
      id,
      ["draft", "active", "awaiting_approval"],
      "cancelled",
      { subject },
    );
    if (!row) throw new PolicyError("This policy can no longer be cancelled.", 409);
    return row;
  }

  private async load(subject: string, id: string) {
    const row = await getTradingPolicy(this.deps.databaseUrl, subject, id);
    if (!row) throw new PolicyError("Policy not found.", 404);
    return { row, policy: TradingPolicy.parse(row.policy) };
  }

  /** Re-checks a policy and, for paper, executes it; for live, prepares a transaction to sign. */
  async approve(principal: { subject: string; tenantId: string }, id: string) {
    const { row, policy } = await this.load(principal.subject, id);
    if (row.status !== "awaiting_approval")
      throw new PolicyError("This policy is not waiting for approval.", 409);
    const asset = await this.deps.catalog.byMint(policy.instrument.mint ?? "");
    if (!asset) throw new PolicyError("The asset is unavailable.");
    const { state } = await this.deps.states.build(asset, [
      ...policy.triggers,
      ...policy.invalidation.conditions,
    ]);
    const evaluation = evaluatePolicy(policy, state);
    if (evaluation.status !== "triggered") {
      const next = evaluation.status === "waiting" ? "active" : evaluation.status;
      await transitionTradingPolicy(this.deps.databaseUrl, id, ["awaiting_approval"], next, {
        lastEvaluation: evaluation,
      });
      throw new PolicyError(
        `Conditions no longer hold (${evaluation.reasons[0] ?? evaluation.status}); the policy is ${next} again.`,
        409,
      );
    }
    if (row.mode === "paper") return this.executePaper(row, policy, asset, evaluation);
    const wallet = String((row.execution as { wallet?: string } | null)?.wallet ?? "");
    const prepared = await this.prepareLive(principal, row, policy, asset, wallet);
    return { status: "awaiting_signature" as const, prepared };
  }

  async executeSigned(
    principal: { subject: string },
    id: string,
    orderId: string,
    signedTransaction: string,
  ) {
    const { row } = await this.load(principal.subject, id);
    if (row.status !== "awaiting_approval")
      throw new PolicyError("This policy is not waiting for a signature.", 409);
    const claimed = await transitionTradingPolicy(
      this.deps.databaseUrl,
      id,
      ["awaiting_approval"],
      "executing",
      { subject: principal.subject },
    );
    if (!claimed) throw new PolicyError("This policy is already executing.", 409);
    const result = await this.deps.trading
      .execute(orderId, principal.subject, signedTransaction)
      .catch((error: unknown) => ({
        status: "failed" as const,
        signature: null,
        error: error instanceof Error ? error.message : "execution failed",
      }));
    const final = result.status === "confirmed" ? "executed" : "failed";
    return transitionTradingPolicy(this.deps.databaseUrl, id, ["executing"], final, {
      execution: {
        wallet: (row.execution as { wallet?: string } | null)?.wallet,
        orderId,
        ...result,
        completedAt: new Date().toISOString(),
      },
    });
  }

  private async prepareLive(
    principal: { subject: string; tenantId: string },
    row: PolicyRow,
    policy: TradingPolicy,
    asset: CatalogAsset,
    wallet: string,
  ) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet))
      throw new PolicyError("The policy has no trading wallet.");
    const balance = await this.deps.helius.getTokenBalance(wallet, asset.mint);
    const price = asset.priceUsd;
    if (!price) throw new PolicyError("A live price is required to size the order.");
    const amount =
      policy.action.side === "buy"
        ? String(Math.round(policy.action.notionalUsd * 1_000_000))
        : String(Math.floor((policy.action.notionalUsd / price) * 10 ** balance.decimals));
    return this.deps.trading.prepare({
      subject: principal.subject,
      tenantId: principal.tenantId,
      wallet,
      mint: asset.mint,
      side: policy.action.side,
      amount,
      book: `policy:${row.id}`,
      slippageBps: policy.execution.maxSlippageBps,
      arrivalPriceUsd: price,
      maxNotionalUsd: MAX_LIVE_NOTIONAL_USD,
    });
  }

  private async executePaper(
    row: PolicyRow,
    policy: TradingPolicy,
    asset: CatalogAsset,
    evaluation: unknown,
  ) {
    const claimed = await transitionTradingPolicy(
      this.deps.databaseUrl,
      row.id,
      ["active", "awaiting_approval"],
      "executing",
      { lastEvaluation: evaluation },
    );
    if (!claimed) throw new PolicyError("This policy is already executing.", 409);
    try {
      const price = asset.priceUsd;
      if (!price) throw new TradeRejection("A price is not available for this asset.");
      const fill = await this.deps.trading.paper({
        subject: row.subject,
        tenantId: row.tenantId,
        mint: asset.mint,
        side: policy.action.side,
        amount:
          policy.action.side === "buy"
            ? policy.action.notionalUsd.toFixed(2)
            : (policy.action.notionalUsd / price).toFixed(8),
        book: `policy:${row.id}`,
        priceUsd: String(price),
      });
      return transitionTradingPolicy(this.deps.databaseUrl, row.id, ["executing"], "executed", {
        execution: { mode: "paper", ...fill, completedAt: new Date().toISOString() },
      });
    } catch (error) {
      return transitionTradingPolicy(this.deps.databaseUrl, row.id, ["executing"], "failed", {
        execution: {
          mode: "paper",
          error: error instanceof Error ? error.message : "execution failed",
          completedAt: new Date().toISOString(),
        },
      });
    }
  }

  /** One scheduler pass over active policies. */
  async evaluateActive(): Promise<{ evaluated: number; triggered: number }> {
    const rows = await listSchedulablePolicies(this.deps.databaseUrl);
    let triggered = 0;
    for (const row of rows) {
      try {
        const policy = TradingPolicy.parse(row.policy);
        const asset = await this.deps.catalog.byMint(policy.instrument.mint ?? "");
        if (!asset) {
          await recordPolicyEvaluation(this.deps.databaseUrl, row.id, {
            status: "waiting",
            reasons: ["Asset data unavailable."],
            evaluatedAt: new Date().toISOString(),
          });
          continue;
        }
        const { state, snapshot } = await this.deps.states.build(asset, [
          ...policy.triggers,
          ...policy.invalidation.conditions,
        ]);
        const evaluation = { ...evaluatePolicy(policy, state), snapshot };
        if (evaluation.status === "expired" || evaluation.status === "invalidated") {
          await transitionTradingPolicy(
            this.deps.databaseUrl,
            row.id,
            ["active"],
            evaluation.status,
            { lastEvaluation: evaluation },
          );
          continue;
        }
        if (evaluation.status === "waiting") {
          await recordPolicyEvaluation(this.deps.databaseUrl, row.id, evaluation);
          continue;
        }
        // Triggered: portfolio limits are enforced before anything executes.
        const impact = await this.deps.portfolio
          .impact(
            row.subject,
            row.mode,
            { asset, side: policy.action.side, notionalUsd: policy.action.notionalUsd },
            [String((row.execution as { wallet?: string } | null)?.wallet ?? "")].filter(Boolean),
          )
          .catch(() => null);
        const blocked = impact == null || impact.impact.blocked;
        if (blocked) {
          await recordPolicyEvaluation(this.deps.databaseUrl, row.id, {
            ...evaluation,
            status: "waiting",
            reasons: [
              "Conditions met, but portfolio risk checks blocked execution.",
              ...(impact?.impact.warnings ?? ["Portfolio state is unavailable."]),
            ],
          });
          continue;
        }
        triggered++;
        if (policy.execution.requireApproval) {
          await transitionTradingPolicy(
            this.deps.databaseUrl,
            row.id,
            ["active"],
            "awaiting_approval",
            { lastEvaluation: { ...evaluation, impact: impact?.impact } },
          );
          continue;
        }
        if (row.mode === "paper") {
          await this.executePaper(row, policy, asset, { ...evaluation, impact: impact?.impact });
          continue;
        }
        await this.executeDelegated(row, policy, asset, evaluation);
      } catch (error) {
        this.deps.log.warn(
          { policyId: row.id, error: error instanceof Error ? error.message : "unknown" },
          "policy evaluation failed",
        );
      }
    }
    return { evaluated: rows.length, triggered };
  }

  private async executeDelegated(
    row: PolicyRow,
    policy: TradingPolicy,
    asset: CatalogAsset,
    evaluation: unknown,
  ) {
    const wallet = String((row.execution as { wallet?: string } | null)?.wallet ?? "");
    if (!this.deps.signer.available || !(await this.deps.signer.isDelegated(row.subject, wallet))) {
      await transitionTradingPolicy(
        this.deps.databaseUrl,
        row.id,
        ["active"],
        "awaiting_approval",
        { lastEvaluation: evaluation },
      );
      return;
    }
    const claimed = await transitionTradingPolicy(
      this.deps.databaseUrl,
      row.id,
      ["active"],
      "executing",
      { lastEvaluation: evaluation },
    );
    if (!claimed) return;
    try {
      const prepared = await this.prepareLive(
        { subject: row.subject, tenantId: row.tenantId },
        row,
        policy,
        asset,
        wallet,
      );
      const result = await this.deps.trading.executeWithSigner(
        prepared.orderId,
        row.subject,
        (unsigned, signerWallet) => this.deps.signer.sign(row.subject, unsigned, signerWallet),
      );
      await transitionTradingPolicy(
        this.deps.databaseUrl,
        row.id,
        ["executing"],
        result.status === "confirmed" ? "executed" : "failed",
        {
          execution: {
            wallet,
            orderId: prepared.orderId,
            ...result,
            delegated: true,
            completedAt: new Date().toISOString(),
          },
        },
      );
    } catch (error) {
      await transitionTradingPolicy(this.deps.databaseUrl, row.id, ["executing"], "failed", {
        execution: {
          wallet,
          error: error instanceof Error ? error.message : "execution failed",
          completedAt: new Date().toISOString(),
        },
      });
    }
  }
}
