import { z } from "zod";

const Quote = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
    priceImpactPct: z.string().nullable().optional(),
    router: z.string(),
    requestId: z.string(),
    transaction: z.string().nullable().optional(),
  })
  .passthrough();

export class JupiterQuoteClient {
  constructor(private readonly apiKey: string) {}

  async preview(inputMint: string, outputMint: string, amount: string) {
    const url = new URL("https://api.jup.ag/swap/v2/order");
    url.search = new URLSearchParams({ inputMint, outputMint, amount }).toString();
    const response = await fetch(url, {
      headers: { "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Jupiter quote returned ${response.status}`);
    const quote = Quote.parse(await response.json());
    if (quote.transaction != null)
      throw new Error("Jupiter returned a transaction for a quote-only request");
    return {
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct ?? null,
      router: quote.router,
      requestId: quote.requestId,
      executable: false as const,
    };
  }

  async order(inputMint: string, outputMint: string, amount: string, taker: string) {
    const url = new URL("https://api.jup.ag/swap/v2/order");
    url.search = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      taker,
      slippageBps: "100",
    }).toString();
    const response = await fetch(url, {
      headers: { "x-api-key": this.apiKey },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Jupiter order returned ${response.status}`);
    const order = Quote.parse(await response.json());
    if (!order.transaction) throw new Error("Jupiter could not build this trade");
    return { ...order, transaction: order.transaction };
  }

  async execute(signedTransaction: string, requestId: string) {
    const response = await fetch("https://api.jup.ag/swap/v2/execute", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ signedTransaction, requestId }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new Error(`Jupiter execution returned ${response.status}`);
    return z
      .object({
        status: z.enum(["Success", "Failed"]),
        signature: z.string().optional(),
        error: z.string().optional(),
        inputAmountResult: z.string().optional(),
        outputAmountResult: z.string().optional(),
      })
      .parse(await response.json());
  }
}
