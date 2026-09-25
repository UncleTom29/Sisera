import { type NextRequest, NextResponse } from "next/server";
import { sessionCookieName, verifyPrivyAccessToken } from "../../../auth";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  if (
    !sameOrigin(request) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  let token: unknown;
  try {
    token = (await request.json()).accessToken;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof token !== "string" || token.length > 8000)
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  try {
    const claims = await verifyPrivyAccessToken(token);
    const response = NextResponse.json({ userId: claims.userId });
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
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_request" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(sessionCookieName);
  return response;
}
