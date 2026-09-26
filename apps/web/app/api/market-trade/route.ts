import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";
import { serverApiUrl } from "../../../lib/server-api-url";

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  const session = await auth();
  const local =
    process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production";
  if (!session && !local)
    return NextResponse.json({ message: "Sign in to trade." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ message: "Invalid order." }, { status: 400 });
  const live = body.mode === "live" && body.venue === "binance";
  if (body.mode !== "paper" && !live)
    return NextResponse.json({ message: "Unsupported order mode." }, { status: 400 });
  if (
    live &&
    (!session ||
      session.accessToken.startsWith("guest:") ||
      session.accessToken.startsWith("wallet:"))
  )
    return NextResponse.json(
      { message: "Sign in with your account to trade live." },
      { status: 401 },
    );
  try {
    const response = await fetch(
      `${serverApiUrl()}${live ? "/v1/market-orders/binance/live" : "/v1/market-orders/paper"}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session
            ? { authorization: `Bearer ${session.accessToken}` }
            : { "x-sisera-dev-role": "trader", "x-sisera-dev-subject": "web-local" }),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(live ? 25000 : 15000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Trading service is unavailable." }, { status: 503 });
  }
}
