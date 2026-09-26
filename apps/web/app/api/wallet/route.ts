import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { serverApiUrl } from "../../../lib/server-api-url";

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
    const localSession =
      process.env.NODE_ENV !== "production" &&
      (session?.accessToken.startsWith("guest:") || session?.accessToken.startsWith("wallet:"));
    const response = await fetch(`${serverApiUrl()}/v1/solana/wallet/${address}`, {
      headers:
        session && !localSession
          ? { authorization: `Bearer ${session.accessToken}` }
          : { "x-sisera-dev-role": "viewer", "x-sisera-dev-subject": "web-local" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      return NextResponse.json(
        {
          message:
            response.status === 401 || response.status === 403
              ? "Wallet access requires a valid Sisera session."
              : "Wallet balances are unavailable from the Solana RPC.",
        },
        { status: response.status === 401 || response.status === 403 ? response.status : 503 },
      );
    return NextResponse.json(await response.json(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Wallet balances are unavailable." }, { status: 503 });
  }
}
