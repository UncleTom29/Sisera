import { NextResponse } from "next/server";
import { serverApiUrl } from "../../../lib/server-api-url";

export async function GET() {
  try {
    const response = await fetch(`${serverApiUrl()}/v1/capabilities`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error("Capabilities unavailable");
    return NextResponse.json(await response.json(), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { live: { solana: false, predictions: false, binance: false, hyperliquid: false } },
      { status: 503 },
    );
  }
}
