import {
  type LaunchRow,
  createLaunch,
  getLatestAgentManifest,
  getLaunch,
  listLaunches,
  updateLaunch,
} from "@sisera/db";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { z } from "zod";
import { type ClawpumpClient, ClawpumpError, type SelfFundedLaunchInput } from "../clawpump.js";
import { verifySignedSwap } from "../solana-trading.js";
import { type AssetCatalog, SOL_MINT, USDC_MINT } from "./catalog.js";
import { DbcError, DbcLaunchInput, type DbcService } from "./dbc.js";

export class LaunchError extends Error {
  constructor(
    message: string,
    readonly statusCode = 422,
  ) {
    super(message);
  }
}

const Mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

export const ClawpumpLaunchInput = z
  .object({
    agentId: z
      .string()
      .regex(/^custom:[0-9a-f-]{36}$/)
      .nullable()
      .optional(),
    name: z.string().trim().min(1).max(32),
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,10}$/),
    description: z.string().trim().min(20).max(500),
    imageUrl: z.string().url().startsWith("https://").max(500),
    wallet: Mint,
    /** A Pump.fun pair from Clawpump's catalogue; a stock mint creates a stock-paired market. */
    pairMint: Mint.optional(),
    creatorFeeBps: z.number().int().min(100).max(300).optional(),
    devBuySol: z.number().min(0).max(50).default(0),
    website: z.string().url().max(200).optional(),
    twitter: z.string().url().max(200).optional(),
  })
  .strict();

/**
 * Launch orchestration. Clawpump handles the agent and token launch on Pump.fun; Meteora DBC
 * handles programmable curve launches. In both cases the creator's wallet signs and pays; Sisera
 * never holds keys. Every launch is recorded, idempotent on its payment signature, and resumable.
 */
export class LaunchService {
  private readonly connection: Connection;

  constructor(
    private readonly databaseUrl: string,
    rpcUrl: string,
    private readonly clawpump: ClawpumpClient | null,
    private readonly dbc: DbcService,
    private readonly catalog: AssetCatalog,
    private readonly publicUrl: string,
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  list(subject: string) {
    return listLaunches(this.databaseUrl, { subject });
  }

  async get(subject: string, id: string) {
    const launch = await getLaunch(this.databaseUrl, id);
    if (!launch || launch.subject !== subject) throw new LaunchError("Launch not found.", 404);
    if (launch.venue === "clawpump" && launch.status === "confirming")
      return this.resumeClawpump(launch);
    return launch;
  }

  /** Public token metadata for Meteora launches (Metaplex JSON standard). */
  async metadata(id: string) {
    const launch = await getLaunch(this.databaseUrl, id);
    if (!launch || launch.venue !== "meteora_dbc") return null;
    return {
      name: launch.name,
      symbol: launch.symbol,
      description: launch.description,
      image: launch.imageUrl,
      external_url: `${this.publicUrl}/launch/${launch.id}`,
      attributes: [
        { trait_type: "Launched with", value: "Sisera + Meteora DBC" },
        ...(launch.referenceSymbol
          ? [{ trait_type: "Reference asset", value: launch.referenceSymbol }]
          : []),
        ...(launch.agentId ? [{ trait_type: "Sisera agent", value: launch.agentId }] : []),
      ],
    };
  }

  private async agentContext(subject: string, agentId: string | null | undefined) {
    if (!agentId) return null;
    const manifest = await getLatestAgentManifest(this.databaseUrl, agentId);
    if (!manifest || manifest.ownerSubject !== subject)
      throw new LaunchError("You can only launch a token for your own agent.", 403);
    return manifest;
  }

  private async transferTransaction(from: string, to: string, lamports: number) {
    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: new PublicKey(from),
      recentBlockhash: blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: new PublicKey(from),
          toPubkey: new PublicKey(to),
          lamports,
        }),
      ],
    }).compileToV0Message();
    return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
  }

  async quoteClawpump(principal: { subject: string; tenantId: string }, body: unknown) {
    if (!this.clawpump)
      throw new LaunchError("Clawpump launches need the partner API key on the server.", 503);
    const input = ClawpumpLaunchInput.parse(body);
    const manifest = await this.agentContext(principal.subject, input.agentId);
    const pairs = await this.clawpump.pairs();
    const pair = input.pairMint
      ? pairs.assets.find((asset) => asset.mint === input.pairMint)
      : null;
    if (input.pairMint && !pair)
      throw new LaunchError("That pair is not in Clawpump's supported Pump.fun pair list.");
    const reference =
      pair && pair.mint !== SOL_MINT && pair.mint !== USDC_MINT
        ? await this.catalog.byMint(pair.mint).catch(() => null)
        : null;
    // The Clawpump agent is the onchain identity of the Sisera strategy; it runs with the base
    // skill bundle only, because Sisera's runtime and risk engine make the trading decisions.
    const agent = await this.clawpump.createAgent({
      name: (manifest?.name ?? input.name).slice(0, 60),
      persona: "Transparent Sisera strategy agent. Reports its manifest, stage and decision trail.",
      systemPrompt: manifest
        ? `You represent the Sisera strategy "${manifest.name}" (manifest ${manifest.manifestHash.slice(0, 16)}). Trading decisions are made by Sisera's governed runtime, not by you. Do not execute trades.`
        : `You represent the token ${input.symbol} launched through Sisera. Do not execute trades.`,
    });
    const launchInput: SelfFundedLaunchInput = {
      agentId: agent.id,
      agentName: agent.name,
      name: input.name,
      symbol: input.symbol.toUpperCase(),
      description: input.description,
      imageUrl: input.imageUrl,
      walletAddress: input.wallet,
      ...(pair && pair.mint !== SOL_MINT
        ? {
            pumpQuoteMint: pair.mint,
            pumpCreatorFeeBps: input.creatorFeeBps ?? pairs.creatorFeeBps.default,
          }
        : {}),
      devBuySol: input.devBuySol,
      ...(input.website ? { website: input.website } : {}),
      ...(input.twitter ? { twitter: input.twitter } : {}),
    };
    const quote = await this.clawpump.selfFundedQuote(launchInput);
    if (quote.payment.method !== "sol")
      throw new LaunchError(
        "Clawpump returned a non-SOL payment method, which Sisera does not support.",
      );
    const transaction = await this.transferTransaction(
      input.wallet,
      quote.payment.payTo,
      quote.payment.amountLamports,
    );
    const expiresAt = new Date(
      Date.now() + Math.min(900, quote.payment.validForSeconds ?? 900) * 1000 - 30_000,
    ).toISOString();
    const launch = await createLaunch(this.databaseUrl, {
      tenantId: principal.tenantId,
      subject: principal.subject,
      venue: "clawpump",
      agentId: input.agentId ?? null,
      status: "awaiting_signature",
      name: input.name,
      symbol: input.symbol.toUpperCase(),
      description: input.description,
      imageUrl: input.imageUrl,
      wallet: input.wallet,
      quoteMint: pair?.mint ?? SOL_MINT,
      quoteSymbol: pair?.symbol ?? "SOL",
      referenceSymbol: reference?.symbol ?? null,
      config: { launchInput, creatorFeeBps: launchInput.pumpCreatorFeeBps ?? null },
      providerState: {
        clawpumpAgentId: agent.id,
        preflightToken: quote.retryWith.preflightToken,
        payTo: quote.payment.payTo,
        amountLamports: quote.payment.amountLamports,
        breakdown: quote.payment.breakdown ?? null,
      },
      unsignedTransaction: JSON.stringify([transaction]),
      expiresAt,
    });
    return {
      launch,
      transactions: [transaction],
      payment: {
        amountSol: quote.payment.amountLamports / 1e9,
        payTo: quote.payment.payTo,
        expiresAt,
      },
    };
  }

  async previewDbc(body: unknown) {
    return this.dbc.preview(DbcLaunchInput.parse(body));
  }

  async prepareDbc(principal: { subject: string; tenantId: string }, body: unknown) {
    const input = DbcLaunchInput.parse(body);
    await this.agentContext(principal.subject, input.agentId);
    const quoteAsset = await this.catalog.byMint(input.quoteMint).catch(() => null);
    const launch = await createLaunch(this.databaseUrl, {
      tenantId: principal.tenantId,
      subject: principal.subject,
      venue: "meteora_dbc",
      agentId: input.agentId ?? null,
      status: "draft",
      name: input.name,
      symbol: input.symbol.toUpperCase(),
      description: input.description,
      imageUrl: input.imageUrl,
      wallet: input.wallet,
      quoteMint: input.quoteMint,
      quoteSymbol:
        input.quoteMint === SOL_MINT
          ? "SOL"
          : input.quoteMint === USDC_MINT
            ? "USDC"
            : (quoteAsset?.symbol ?? "TOKEN"),
      referenceSymbol: input.referenceSymbol ?? quoteAsset?.symbol ?? null,
      config: { ...input, referencePriceAtLaunchUsd: quoteAsset?.priceUsd ?? null },
    });
    try {
      const built = await this.dbc.build(
        input,
        `${this.publicUrl}/api/launch-metadata/${launch.id}`,
      );
      const updated = await updateLaunch(this.databaseUrl, launch.id, ["draft"], {
        status: "awaiting_signature",
        baseMint: built.baseMint,
        poolAddress: built.poolAddress,
        configAddress: built.configAddress,
        unsignedTransaction: JSON.stringify(built.transactions),
        providerState: { simulation: built.simulation, quote: built.quote },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      return { launch: updated ?? launch, transactions: built.transactions };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Launch could not be built";
      await updateLaunch(this.databaseUrl, launch.id, ["draft"], {
        status: "failed",
        error: message,
      });
      throw new LaunchError(
        /AccountNotFound|insufficient/i.test(message)
          ? "The launch wallet needs SOL to pay for account rent and fees."
          : message,
      );
    }
  }

  async submit(subject: string, id: string, signedTransactions: readonly string[]) {
    const launch = await getLaunch(this.databaseUrl, id);
    if (!launch || launch.subject !== subject) throw new LaunchError("Launch not found.", 404);
    if (launch.status !== "awaiting_signature" || !launch.unsignedTransaction)
      throw new LaunchError("This launch is not waiting for a signature.", 409);
    if (launch.expiresAt && Date.parse(launch.expiresAt) < Date.now()) {
      await updateLaunch(this.databaseUrl, id, ["awaiting_signature"], { status: "expired" });
      throw new LaunchError("The launch quote expired. Prepare it again.", 409);
    }
    const unsigned = z.array(z.string()).parse(JSON.parse(launch.unsignedTransaction));
    if (unsigned.length !== signedTransactions.length)
      throw new LaunchError("Every launch transaction must be signed.");
    for (const [index, transaction] of unsigned.entries()) {
      try {
        verifySignedSwap(transaction, signedTransactions[index] ?? "", launch.wallet);
      } catch {
        throw new LaunchError("A signed transaction does not match the launch Sisera prepared.");
      }
    }
    const claimed = await updateLaunch(this.databaseUrl, id, ["awaiting_signature"], {
      status: "submitted",
    });
    if (!claimed) throw new LaunchError("This launch is already being submitted.", 409);
    if (launch.venue === "meteora_dbc") {
      try {
        const signatures = await this.dbc.submit(unsigned, signedTransactions, launch.wallet);
        return updateLaunch(this.databaseUrl, id, ["submitted"], {
          status: "launched",
          signature: signatures.at(-1) ?? null,
          providerState: { signatures },
          unsignedTransaction: null,
        });
      } catch (error) {
        return updateLaunch(this.databaseUrl, id, ["submitted"], {
          status: "failed",
          error: error instanceof Error ? error.message : "Submission failed",
        });
      }
    }
    // Clawpump: pay the quoted SOL transfer, then hand the proof to Clawpump.
    let signature: string;
    try {
      signature = await this.connection.sendRawTransaction(
        Buffer.from(signedTransactions[0] ?? "", "base64"),
        { maxRetries: 3 },
      );
      const latest = await this.connection.getLatestBlockhash("confirmed");
      const confirmation = await this.connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err));
    } catch (error) {
      return updateLaunch(this.databaseUrl, id, ["submitted"], {
        status: "failed",
        error: `Payment failed: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
    const confirming = await updateLaunch(this.databaseUrl, id, ["submitted"], {
      status: "confirming",
      signature,
      unsignedTransaction: null,
    });
    return confirming ? this.resumeClawpump(confirming) : null;
  }

  /** Completes (or re-polls) a paid Clawpump launch. Safe to call repeatedly. */
  private async resumeClawpump(launch: LaunchRow): Promise<LaunchRow> {
    if (!this.clawpump || !launch.signature) return launch;
    const state = launch.providerState as { preflightToken?: string };
    const input = (launch.config as { launchInput?: SelfFundedLaunchInput }).launchInput;
    if (!state.preflightToken || !input) return launch;
    try {
      const { pending, result } = await this.clawpump.completeSelfFundedLaunch({
        ...input,
        txSignature: launch.signature,
        preflightToken: state.preflightToken,
      });
      if (pending || !result?.mintAddress) return launch;
      return (
        (await updateLaunch(this.databaseUrl, launch.id, ["confirming"], {
          status: "launched",
          baseMint: result.mintAddress,
          providerState: {
            launchTx: result.txHash ?? null,
            pumpUrl: result.pumpUrl ?? null,
            payoutWallet: result.payoutWallet ?? null,
            quoteAsset: result.pumpQuoteAsset ?? null,
          },
        })) ?? launch
      );
    } catch (error) {
      if (error instanceof ClawpumpError && error.status >= 500 && error.body?.retrySafe === true)
        return launch;
      return (
        (await updateLaunch(this.databaseUrl, launch.id, ["confirming"], {
          status: "failed",
          error:
            error instanceof ClawpumpError
              ? `Clawpump ${error.status}${error.code ? ` ${error.code}` : ""}`
              : "Launch completion failed",
        })) ?? launch
      );
    }
  }

  /** Launch monitor: curve state for DBC pools and market data for every launched token. */
  async monitor(subject: string, id: string) {
    const launch = await this.get(subject, id);
    const [curve, asset, quoteAsset] = await Promise.all([
      launch.venue === "meteora_dbc" && launch.poolAddress && launch.status === "launched"
        ? this.dbc.monitor(launch.poolAddress).catch(() => null)
        : Promise.resolve(null),
      launch.baseMint
        ? this.catalog.byMint(launch.baseMint).catch(() => null)
        : Promise.resolve(null),
      launch.quoteMint === USDC_MINT
        ? Promise.resolve(null)
        : this.catalog.byMint(launch.quoteMint).catch(() => null),
    ]);
    const quoteUsd = launch.quoteMint === USDC_MINT ? 1 : (quoteAsset?.priceUsd ?? null);
    const priceUsd =
      curve && quoteUsd != null ? curve.priceInQuote * quoteUsd : (asset?.priceUsd ?? null);
    const config = launch.config as { initialMarketCap?: number; totalSupply?: number };
    const startPriceInQuote =
      config.initialMarketCap && config.totalSupply
        ? config.initialMarketCap / config.totalSupply
        : null;
    return {
      launch,
      curve,
      market: asset
        ? {
            priceUsd: asset.priceUsd,
            liquidityUsd: asset.liquidityUsd,
            volume24hUsd: asset.volume24hUsd,
            change24hPct: asset.change24hPct,
            marketCapUsd: asset.marketCapUsd,
          }
        : null,
      pricing: {
        priceUsd,
        quoteUsd,
        // For stock-quoted curves the token is priced directly in the stock.
        priceInReference:
          curve &&
          launch.referenceSymbol &&
          launch.quoteMint !== SOL_MINT &&
          launch.quoteMint !== USDC_MINT
            ? curve.priceInQuote
            : null,
        changeFromLaunchPct:
          curve && startPriceInQuote ? (curve.priceInQuote / startPriceInQuote - 1) * 100 : null,
      },
      observedAt: new Date().toISOString(),
    };
  }
}

export { DbcError };
