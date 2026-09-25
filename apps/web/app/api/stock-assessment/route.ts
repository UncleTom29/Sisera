import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";

export async function POST(request: NextRequest) {
  if (
    request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  const session = await auth();
  const localOperator =
    process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production";
  if (!session && !localOperator)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let symbol: unknown;
  try {
    symbol = (await request.json()).symbol;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof symbol !== "string" || !/^[A-Za-z0-9-]{1,20}$/.test(symbol))
    return NextResponse.json({ error: "invalid_symbol" }, { status: 400 });
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/v1/stocks/${encodeURIComponent(symbol)}/assessment`, {
      method: "POST",
      headers: session
        ? { authorization: `Bearer ${session.accessToken}` }
        : { "x-sisera-dev-role": "viewer" },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok)
      return NextResponse.json(
        { error: response.status === 503 ? "model_unavailable" : "assessment_failed" },
        { status: response.status >= 500 ? 503 : response.status },
      );
    return NextResponse.json(await response.json(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "assessment_failed" }, { status: 503 });
  }
}
