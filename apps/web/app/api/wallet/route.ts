import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";

export async function GET(request: NextRequest) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))
    return NextResponse.json({ message: "Invalid wallet." }, { status: 400 });
  const session = await auth();
  const local =
    process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production";
  if (!session && !local)
    return NextResponse.json({ message: "Sign in to view balances." }, { status: 401 });
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/v1/solana/wallet/${address}`,
      {
        headers: session
          ? { authorization: `Bearer ${session.accessToken}` }
          : { "x-sisera-dev-role": "viewer" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      return NextResponse.json({ message: "Wallet balances are unavailable." }, { status: 503 });
    return NextResponse.json(await response.json(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Wallet balances are unavailable." }, { status: 503 });
  }
}
