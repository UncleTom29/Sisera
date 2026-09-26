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
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json(
      { message: "Sign in with your account to trade live." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ message: "Invalid order." }, { status: 400 });
  const path =
    body.action === "prepare"
      ? "/v1/prediction-orders/prepare"
      : body.action === "execute" &&
          typeof body.orderId === "string" &&
          /^[0-9a-f-]{36}$/i.test(body.orderId)
        ? `/v1/prediction-orders/${body.orderId}/execute`
        : null;
  if (!path) return NextResponse.json({ message: "Invalid prediction action." }, { status: 400 });
  try {
    const response = await fetch(`${serverApiUrl()}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(body.action === "execute" ? 55_000 : 20_000),
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        message:
          "Prediction order status is unknown. Check your wallet and Activity before retrying.",
      },
      { status: 503 },
    );
  }
}
