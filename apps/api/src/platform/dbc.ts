import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  type ConfigParameters,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  deriveDbcPoolAddress,
  deriveTokenBadgeAddress,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  type Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { z } from "zod";
import { verifySignedSwap } from "../solana-trading.js";
import { SOL_MINT, USDC_MINT } from "./catalog.js";

/**
 * Meteora Dynamic Bonding Curve launches configured for stock-linked assets. Presets are designed
 * around assets with an external reference value: a tight, reference-anchored curve for price
 * discovery near a known value; a wider discovery curve; and an agent-treasury curve with locked
 * creator vesting. Sisera builds and simulates the transactions; the creator's wallet signs them.
 */

export const DBC_PRESETS = {
  reference_anchored: {
    label: "Reference-anchored",
    description:
      "Narrow curve (graduates at 4× the starting value) with a decaying anti-sniper fee and dynamic fees, for tokens whose value should track a stock or a known reference.",
    graduationMultiple: 4,
    fee: {
      startingBps: 500,
      endingBps: 100,
      periods: 30,
      durationSeconds: 1800,
      mode: "exponential" as const,
    },
    dynamicFee: true,
    creatorTradingFeePct: 50,
    lockedVestingPct: 0,
    migratedPoolFeeBps: 30,
  },
  price_discovery: {
    label: "Open price discovery",
    description:
      "Wider curve (graduates at 25× the starting value) with a linear fee schedule, for assets without a reliable reference.",
    graduationMultiple: 25,
    fee: {
      startingBps: 300,
      endingBps: 100,
      periods: 20,
      durationSeconds: 3600,
      mode: "linear" as const,
    },
    dynamicFee: true,
    creatorTradingFeePct: 50,
    lockedVestingPct: 0,
    migratedPoolFeeBps: 100,
  },
  agent_treasury: {
    label: "Agent treasury",
    description:
      "Moderate curve (10×) that locks 10% of supply for the agent treasury, vesting over 180 days after graduation, so operators cannot dump at launch.",
    graduationMultiple: 10,
    fee: {
      startingBps: 400,
      endingBps: 100,
      periods: 24,
      durationSeconds: 2400,
      mode: "exponential" as const,
    },
    dynamicFee: true,
    creatorTradingFeePct: 75,
    lockedVestingPct: 10,
    migratedPoolFeeBps: 30,
  },
} as const;
export type DbcPreset = keyof typeof DBC_PRESETS;

const Mint = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

export const DbcLaunchInput = z
  .object({
    preset: z.enum(["reference_anchored", "price_discovery", "agent_treasury"]),
    name: z.string().trim().min(2).max(32),
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{2,10}$/),
    description: z.string().trim().min(20).max(500),
    imageUrl: z.string().url().max(500),
    wallet: Mint,
    quoteMint: Mint,
    /** Starting fully diluted value, in quote-token units. */
    initialMarketCap: z.number().positive().max(1e12),
    graduationMultiple: z.number().min(1.5).max(200).optional(),
    totalSupply: z.number().int().min(1_000_000).max(10_000_000_000).default(1_000_000_000),
    feeStartingBps: z.number().int().min(25).max(9900).optional(),
    feeEndingBps: z.number().int().min(25).max(9900).optional(),
    creatorTradingFeePct: z.number().int().min(0).max(100).optional(),
    firstBuyQuote: z.number().min(0).max(1e9).default(0),
    referenceSymbol: z.string().max(20).nullable().optional(),
    agentId: z.string().max(80).nullable().optional(),
  })
  .strict();
export type DbcLaunchInput = z.infer<typeof DbcLaunchInput>;

export class DbcError extends Error {
  constructor(
    message: string,
    readonly statusCode = 422,
  ) {
    super(message);
  }
}

type QuoteInfo = {
  mint: string;
  decimals: number;
  tokenProgram: "spl" | "token2022";
  badge: boolean;
};

export class DbcService {
  private readonly connection: Connection;
  private readonly client: DynamicBondingCurveClient;
  private readonly quoteCache = new Map<string, { until: number; value: QuoteInfo }>();

  constructor(
    rpcUrl: string,
    private readonly partnerWallet: string | undefined,
  ) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.client = DynamicBondingCurveClient.create(this.connection, "confirmed");
  }

  async quoteInfo(mint: string): Promise<QuoteInfo> {
    const cached = this.quoteCache.get(mint);
    if (cached && cached.until > Date.now()) return cached.value;
    if (mint === SOL_MINT) return { mint, decimals: 9, tokenProgram: "spl", badge: false };
    const account = await this.connection.getParsedAccountInfo(new PublicKey(mint));
    const data = account.value?.data;
    if (!account.value || !data || !("parsed" in data))
      throw new DbcError("Quote mint was not found onchain.");
    const tokenProgram =
      account.value.owner.toBase58() === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        ? "token2022"
        : "spl";
    const badge =
      tokenProgram === "token2022"
        ? Boolean(await this.client.state.getTokenBadge(mint).catch(() => null))
        : false;
    const value: QuoteInfo = {
      mint,
      decimals: Number((data.parsed as { info: { decimals: number } }).info.decimals),
      tokenProgram,
      badge,
    };
    this.quoteCache.set(mint, { until: Date.now() + 3_600_000, value });
    return value;
  }

  /** Builds curve parameters from a preset and the creator's inputs. */
  buildConfig(input: DbcLaunchInput, quote: QuoteInfo): ConfigParameters {
    const preset = DBC_PRESETS[input.preset];
    const multiple = input.graduationMultiple ?? preset.graduationMultiple;
    const startingBps = input.feeStartingBps ?? preset.fee.startingBps;
    const endingBps = Math.min(startingBps, input.feeEndingBps ?? preset.fee.endingBps);
    const locked = Math.floor((input.totalSupply * preset.lockedVestingPct) / 100);
    return buildCurveWithMarketCap({
      token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: quote.decimals,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: input.totalSupply,
        leftover: 0,
      },
      fee: {
        baseFeeParams: {
          baseFeeMode:
            preset.fee.mode === "linear"
              ? BaseFeeMode.FeeSchedulerLinear
              : BaseFeeMode.FeeSchedulerExponential,
          feeSchedulerParam: {
            startingFeeBps: startingBps,
            endingFeeBps: endingBps,
            numberOfPeriod: preset.fee.periods,
            totalDuration: preset.fee.durationSeconds,
          },
        },
        dynamicFeeEnabled: preset.dynamicFee,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: input.creatorTradingFeePct ?? preset.creatorTradingFeePct,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: input.firstBuyQuote > 0,
      },
      migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
          collectFeeMode: MigratedCollectFeeMode.QuoteToken,
          dynamicFee: DammV2DynamicFeeMode.Enabled,
          poolFeeBps: preset.migratedPoolFeeBps,
        },
      },
      liquidityDistribution: {
        partnerPermanentLockedLiquidityPercentage: this.partnerWallet ? 10 : 0,
        partnerLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: this.partnerWallet ? 40 : 50,
        creatorLiquidityPercentage: 50,
      },
      lockedVesting: locked
        ? {
            totalLockedVestingAmount: locked,
            numberOfVestingPeriod: 180,
            cliffUnlockAmount: 0,
            totalVestingDuration: 180 * 86_400,
            cliffDurationFromMigrationTime: 0,
          }
        : {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
          },
      activationType: ActivationType.Timestamp,
      initialMarketCap: input.initialMarketCap,
      migrationMarketCap: input.initialMarketCap * multiple,
    });
  }

  /** Human-readable summary of a configuration, including the price ladder a buyer would see. */
  async preview(input: DbcLaunchInput) {
    const quote = await this.quoteInfo(input.quoteMint);
    const warnings: string[] = [];
    if (quote.tokenProgram === "token2022" && !quote.badge)
      warnings.push(
        "This quote asset is a Token-2022 mint without a Meteora DBC token badge; the launch simulation will confirm whether the program accepts it.",
      );
    const config = this.buildConfig(input, quote);
    const startPrice = getPriceFromSqrtPrice(
      config.sqrtStartPrice,
      TokenDecimal.SIX,
      quote.decimals,
    );
    const threshold = Number(config.migrationQuoteThreshold.toString()) / 10 ** quote.decimals;
    const multiple = input.graduationMultiple ?? DBC_PRESETS[input.preset].graduationMultiple;
    const ladder: Array<{ quoteIn: number; tokensOut: number; averagePrice: number }> = [];
    for (const fraction of [0.001, 0.01, 0.05, 0.1]) {
      const amount = threshold * fraction;
      try {
        const result = this.client.pool.getQuoteFromInputAmount({
          config,
          swapBaseForQuote: false,
          amountIn: new BN(Math.floor(amount * 10 ** quote.decimals).toString()),
        });
        const out = Number(result.outputAmount.toString()) / 1e6;
        ladder.push({ quoteIn: amount, tokensOut: out, averagePrice: out > 0 ? amount / out : 0 });
      } catch {
        // Quotes that cannot be simulated are omitted rather than estimated.
      }
    }
    return {
      preset: input.preset,
      presetInfo: DBC_PRESETS[input.preset],
      quote,
      startPrice: Number(startPrice.toString()),
      graduationPrice: Number(startPrice.toString()) * multiple,
      initialMarketCap: input.initialMarketCap,
      graduationMarketCap: input.initialMarketCap * multiple,
      migrationQuoteThreshold: threshold,
      curvePoints: config.curve.length,
      totalSupply: input.totalSupply,
      lockedVestingPct: DBC_PRESETS[input.preset].lockedVestingPct,
      creatorTradingFeePct:
        input.creatorTradingFeePct ?? DBC_PRESETS[input.preset].creatorTradingFeePct,
      fees: {
        startingBps: input.feeStartingBps ?? DBC_PRESETS[input.preset].fee.startingBps,
        endingBps: input.feeEndingBps ?? DBC_PRESETS[input.preset].fee.endingBps,
        decaySeconds: DBC_PRESETS[input.preset].fee.durationSeconds,
      },
      migration: "Meteora DAMM v2, liquidity locked per the preset distribution",
      ladder,
      warnings,
    };
  }

  private async toVersioned(
    transaction: Transaction,
    payer: PublicKey,
    signers: readonly Keypair[],
    blockhash: string,
  ) {
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: transaction.instructions,
    }).compileToV0Message();
    const versioned = new VersionedTransaction(message);
    const required = new Set(
      message.staticAccountKeys
        .slice(0, message.header.numRequiredSignatures)
        .map((key) => key.toBase58()),
    );
    versioned.sign(signers.filter((signer) => required.has(signer.publicKey.toBase58())));
    return versioned;
  }

  /**
   * Builds the config and pool transactions, partially signs them with fresh config and mint
   * keypairs (which hold no authority afterwards) and simulates both before returning them.
   */
  async build(input: DbcLaunchInput, metadataUri: string) {
    const quote = await this.quoteInfo(input.quoteMint);
    const config = this.buildConfig(input, quote);
    const payer = new PublicKey(input.wallet);
    const configKeypair = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const tokenBadge = quote.badge
      ? deriveTokenBadgeAddress(new PublicKey(input.quoteMint))
      : undefined;
    const firstBuy =
      input.firstBuyQuote > 0
        ? {
            buyer: payer,
            receiver: payer,
            buyAmount: new BN(Math.floor(input.firstBuyQuote * 10 ** quote.decimals).toString()),
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
          }
        : undefined;
    const { createConfigTx, createPoolWithFirstBuyTx } =
      await this.client.partner.createConfigAndPoolWithFirstBuy({
        ...config,
        config: configKeypair.publicKey,
        feeClaimer: new PublicKey(this.partnerWallet ?? input.wallet),
        leftoverReceiver: payer,
        quoteMint: new PublicKey(input.quoteMint),
        payer,
        ...(tokenBadge ? { tokenBadge } : {}),
        preCreatePoolParam: {
          name: input.name,
          symbol: input.symbol.toUpperCase(),
          uri: metadataUri,
          poolCreator: payer,
          baseMint: mintKeypair.publicKey,
        },
        ...(firstBuy ? { firstBuyParam: firstBuy } : {}),
      });
    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    const transactions = [
      await this.toVersioned(createConfigTx, payer, [configKeypair], blockhash),
      await this.toVersioned(
        createPoolWithFirstBuyTx,
        payer,
        [mintKeypair, configKeypair],
        blockhash,
      ),
    ];
    const simulation = await this.connection.simulateTransaction(
      transactions[0] as VersionedTransaction,
      { sigVerify: false, commitment: "confirmed" },
    );
    if (simulation.value.err)
      throw new DbcError(
        `Meteora rejected the configuration in simulation${quote.tokenProgram === "token2022" && !quote.badge ? " (this quote asset likely needs a DBC token badge)" : ""}: ${JSON.stringify(simulation.value.err)}`,
      );
    const pool = deriveDbcPoolAddress(
      new PublicKey(input.quoteMint),
      mintKeypair.publicKey,
      configKeypair.publicKey,
    );
    return {
      transactions: transactions.map((transaction) =>
        Buffer.from(transaction.serialize()).toString("base64"),
      ),
      baseMint: mintKeypair.publicKey.toBase58(),
      configAddress: configKeypair.publicKey.toBase58(),
      poolAddress: pool.toBase58(),
      simulation: {
        unitsConsumed: simulation.value.unitsConsumed ?? null,
        logs: (simulation.value.logs ?? []).slice(-6),
      },
      quote,
    };
  }

  /** Verifies that each signed transaction is the one Sisera built, then submits them in order. */
  async submit(unsigned: readonly string[], signed: readonly string[], wallet: string) {
    if (unsigned.length !== signed.length)
      throw new DbcError("Both launch transactions must be signed.");
    for (const [index, transaction] of unsigned.entries())
      verifySignedSwap(transaction, signed[index] ?? "", wallet);
    const signatures: string[] = [];
    for (const transaction of signed) {
      const raw = Buffer.from(transaction, "base64");
      const signature = await this.connection.sendRawTransaction(raw, {
        skipPreflight: false,
        maxRetries: 3,
      });
      const latest = await this.connection.getLatestBlockhash("confirmed");
      const confirmation = await this.connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (confirmation.value.err)
        throw new DbcError(`Launch transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      signatures.push(signature);
    }
    return signatures;
  }

  /** Live curve state for a launched pool, priced in the quote asset. */
  async monitor(poolAddress: string) {
    const account = await this.client.state.getPool(poolAddress);
    if (!account) return null;
    // Depending on the account variant the SDK nests the state under `poolState`.
    const raw = account as unknown as { poolState?: unknown };
    const pool = (raw.poolState ?? account) as {
      config: PublicKey;
      baseMint: PublicKey;
      sqrtPrice: BN;
      quoteReserve: BN;
      isMigrated: number | boolean;
    };
    const [config, progress, fees, baseDecimals] = await Promise.all([
      this.client.state.getPoolConfig(pool.config),
      this.client.state.getPoolQuoteTokenCurveProgress(poolAddress).catch(() => null),
      this.client.state.getPoolFeeMetrics(poolAddress).catch(() => null),
      this.connection.getTokenSupply(pool.baseMint).then((supply) => supply.value.decimals),
    ]);
    if (!config) return null;
    const quote = await this.quoteInfo(config.quoteMint.toBase58());
    const price = Number(
      getPriceFromSqrtPrice(
        pool.sqrtPrice,
        baseDecimals as TokenDecimal,
        quote.decimals,
      ).toString(),
    );
    const toQuote = (value: BN) => Number(value.toString()) / 10 ** quote.decimals;
    return {
      poolAddress,
      baseMint: pool.baseMint.toBase58(),
      quoteMint: config.quoteMint.toBase58(),
      quoteDecimals: quote.decimals,
      priceInQuote: price,
      quoteReserve: toQuote(pool.quoteReserve),
      migrationQuoteThreshold: toQuote(config.migrationQuoteThreshold),
      curveProgressPct: progress == null ? null : progress * 100,
      graduated: Boolean(pool.isMigrated),
      fees: fees
        ? {
            totalTradingQuoteFee: toQuote(fees.total.totalTradingQuoteFee),
            creatorUnclaimedQuoteFee: toQuote(fees.current.creatorQuoteFee),
            partnerUnclaimedQuoteFee: toQuote(fees.current.partnerQuoteFee),
          }
        : null,
      observedAt: new Date().toISOString(),
    };
  }

  static stableQuotes() {
    return [
      { mint: SOL_MINT, symbol: "SOL", kind: "crypto" },
      { mint: USDC_MINT, symbol: "USDC", kind: "stable" },
    ];
  }
}
