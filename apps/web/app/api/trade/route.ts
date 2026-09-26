import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";
import { serverApiUrl } from "../../../lib/server-api-url";

const Actions = {
  paper: "/v1/solana/orders/paper",
  prepare: "/v1/solana/orders/prepare",
} as const;

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  const session = await auth();
  const local =
    process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production";
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ message: "Invalid trade request." }, { status: 400 });
  const action = body.action as string;
  if (!session && !(local && action === "paper"))
    return NextResponse.json({ message: "Sign in to trade." }, { status: 401 });
  let path: string;
  if (action === "paper" || action === "prepare") path = Actions[action];
  else if (
    action === "execute" &&
    typeof body.orderId === "string" &&
    /^[0-9a-f-]{36}$/i.test(body.orderId)
  )
    path = `/v1/solana/orders/${body.orderId}/execute`;
  else return NextResponse.json({ message: "Invalid trade request." }, { status: 400 });
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(session
          ? { authorization: `Bearer ${session.accessToken}` }
          : { "x-sisera-dev-role": "trader", "x-sisera-dev-subject": "web-local" }),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(action === "execute" ? 55000 : 20000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        response.status === 401
          ? "Sign in to trade."
          : response.status === 403
            ? "This account cannot place that trade."
            : response.status === 422
              ? (payload.message ?? "Please review the trade and try again.")
              : "Trading is temporarily unavailable. Please try again shortly.";
      return NextResponse.json({ message }, { status: response.status });
    }
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Trading is temporarily unavailable." }, { status: 503 });
  }
}
