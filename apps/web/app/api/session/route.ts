import { type NextRequest, NextResponse } from "next/server";
import { sessionCookieName, verifyPrivyAccessToken } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // 1. Guest Session
  if (process.env.NODE_ENV !== "production" && body.type === "guest") {
    const guestToken = `guest:${Date.now()}`;
    const response = NextResponse.json({ ok: true, userId: "guest", role: "guest" });
    response.cookies.set(sessionCookieName, guestToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 86400 * 7, // 7 days
    });
    return response;
  }

  // 2. Direct Solana Wallet Session
  if (
    process.env.NODE_ENV !== "production" &&
    body.type === "wallet" &&
    typeof body.wallet === "string"
  ) {
    const address = body.wallet.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      return NextResponse.json({ error: "invalid_wallet_address" }, { status: 400 });
    }
    const walletToken = `wallet:${address}:${Date.now()}`;
    const response = NextResponse.json({ ok: true, userId: `solana:${address}`, wallet: address });
    response.cookies.set(sessionCookieName, walletToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 86400 * 7, // 7 days
    });
    return response;
  }

  // 3. Privy Access Token
  const token = body.accessToken;
  if (typeof token !== "string" || token.length > 8000) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  try {
    const claims = await verifyPrivyAccessToken(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.max(0, Math.min(3600, claims.expiration - Math.floor(Date.now() / 1000))),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(sessionCookieName);
  return response;
}
