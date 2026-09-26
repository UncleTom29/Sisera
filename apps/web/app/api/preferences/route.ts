import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";
import { serverApiUrl } from "../../../lib/server-api-url";

async function forward(method: "GET" | "PUT", request: NextRequest) {
  const session = await auth();
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json({ message: "Sign in to manage account settings." }, { status: 401 });
  if (method === "PUT" && !isSameOrigin(request))
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/preferences`, {
      method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: method === "PUT" ? JSON.stringify(await request.json()) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Account settings are unavailable." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  return forward("GET", request);
}
export async function PUT(request: NextRequest) {
  return forward("PUT", request);
}
