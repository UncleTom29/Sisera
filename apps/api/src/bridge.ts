import { z } from "zod";

export const SOLANA_CHAIN_ID = 792703809;
export const BRIDGE_CHAINS = {
  1: { name: "Ethereum", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  8453: { name: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54dA02913" },
  42161: { name: "Arbitrum", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
} as const;
const DESTINATION_USDC = {
  999: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
  [SOLANA_CHAIN_ID]: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;
export const HYPEREVM_USDC = DESTINATION_USDC[999];
const EvmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const SolanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
export const BridgeQuoteInput = z
  .object({
    originChainId: z.coerce
      .number()
      .int()
      .refine((id) => id in BRIDGE_CHAINS),
    destinationChainId: z.coerce
      .number()
      .int()
      .refine((id) => id in DESTINATION_USDC),
    user: EvmAddress,
    recipient: z.string(),
    amountUsdc: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
  })
  .superRefine((value, context) => {
    const valid =
      value.destinationChainId === SOLANA_CHAIN_ID
        ? SolanaAddress.safeParse(value.recipient).success
        : EvmAddress.safeParse(value.recipient).success;
    if (!valid)
      context.addIssue({
        code: "custom",
        path: ["recipient"],
        message: "Invalid destination wallet",
      });
    const amount = Number(value.amountUsdc);
    if (!Number.isFinite(amount) || amount < 5 || amount > 10_000)
      context.addIssue({
        code: "custom",
        path: ["amountUsdc"],
        message: "Amount must be $5–$10,000",
      });
  });

const Transaction = z.object({
  from: EvmAddress,
  to: EvmAddress,
  data: z.string().regex(/^0x[a-fA-F0-9]*$/),
  value: z.string().regex(/^\d+$/),
  chainId: z.number().int(),
});
const Quote = z.object({
  steps: z
    .array(
      z.object({
        kind: z.string(),
        requestId: z.string().optional(),
        items: z.array(z.object({ data: Transaction })).min(1),
      }),
    )
    .min(1),
  fees: z.record(z.unknown()).optional(),
  details: z.object({
    timeEstimate: z.number().optional(),
    currencyOut: z.object({
      amount: z.string(),
      currency: z.object({ address: z.string(), decimals: z.number().int() }),
    }),
  }),
});

export class BridgeUnavailable extends Error {
  constructor(
    message: string,
    readonly status = 503,
  ) {
    super(message);
  }
}

export class RelayBridgeClient {
  constructor(private readonly apiKey?: string) {}

  async quote(rawInput: unknown) {
    const input = BridgeQuoteInput.parse(rawInput);
    const origin = BRIDGE_CHAINS[input.originChainId as keyof typeof BRIDGE_CHAINS];
    const destination = DESTINATION_USDC[input.destinationChainId as keyof typeof DESTINATION_USDC];
    const [whole, fraction = ""] = input.amountUsdc.split(".");
    const amount = (BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
    const response = await fetch("https://api.relay.link/quote/v2", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
      },
      body: JSON.stringify({
        user: input.user,
        recipient: input.recipient,
        originChainId: input.originChainId,
        destinationChainId: input.destinationChainId,
        originCurrency: origin.usdc,
        destinationCurrency: destination,
        amount,
        tradeType: "EXACT_INPUT",
        usePermit: false,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = z.object({ message: z.string() }).safeParse(payload);
      throw new BridgeUnavailable(
        message.success ? message.data.message : "Relay could not quote this route.",
        response.status < 500 ? 422 : 503,
      );
    }
    const quote = Quote.safeParse(payload);
    if (!quote.success) throw new BridgeUnavailable("Relay returned unsupported bridge steps.");
    const actualOutputMint = quote.data.details.currencyOut.currency.address;
    const correctOutputMint =
      input.destinationChainId === SOLANA_CHAIN_ID
        ? actualOutputMint === destination
        : actualOutputMint.toLowerCase() === destination.toLowerCase();
    if (quote.data.details.currencyOut.currency.decimals !== 6 || !correctOutputMint)
      throw new BridgeUnavailable("Relay returned an unexpected destination token.");
    const requestId = quote.data.steps.find((step) =>
      /^0x[a-fA-F0-9]{64}$/.test(step.requestId ?? ""),
    )?.requestId;
    if (!requestId)
      throw new BridgeUnavailable("Relay did not provide a trackable bridge request.");
    if (
      quote.data.steps.some(
        (step) =>
          step.kind !== "transaction" ||
          step.items.some(
            (item) =>
              item.data.chainId !== input.originChainId ||
              item.data.from.toLowerCase() !== input.user.toLowerCase(),
          ),
      )
    )
      throw new BridgeUnavailable(
        "This bridge route needs wallet actions Sisera cannot sign yet.",
        422,
      );
    return {
      requestId,
      steps: quote.data.steps.map((step) => ({
        kind: step.kind,
        items: step.items.map((item) => item.data),
      })),
      fees: quote.data.fees ?? {},
      outputAmountUsdc: (Number(quote.data.details.currencyOut.amount) / 1_000_000).toFixed(6),
      timeEstimateSeconds: quote.data.details.timeEstimate ?? null,
      originChainId: input.originChainId,
      destinationChainId: input.destinationChainId,
      originAmountUsdc: input.amountUsdc,
      recipient: input.recipient,
    };
  }

  async status(requestId: string) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(requestId))
      throw new BridgeUnavailable("Invalid bridge request ID.", 400);
    const url = new URL("https://api.relay.link/intents/status/v3");
    url.searchParams.set("requestId", requestId);
    const response = await fetch(url, {
      headers: this.apiKey ? { "x-api-key": this.apiKey } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new BridgeUnavailable("Bridge status is unavailable.");
    return z
      .object({
        status: z.string(),
        inTxHashes: z.array(z.string()).optional(),
        txHashes: z.array(z.string()).optional(),
      })
      .parse(await response.json());
  }
}
