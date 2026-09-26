import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";
import { serverApiUrl } from "../../../lib/server-api-url";

async function accessToken() {
  const session = await auth();
  if (session) return { authorization: `Bearer ${session.accessToken}` };
  if (process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production")
    return { "x-sisera-dev-role": "trader", "x-sisera-dev-subject": "web-local" };
  return null;
}

export async function POST(request: NextRequest) {
  if (
    !isSameOrigin(request) ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  const headers = await accessToken();
  if (!headers) return NextResponse.json({ message: "Sign in to bridge." }, { status: 401 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/bridge/quote`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Bridge quote is unavailable." }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  const headers = await accessToken();
  if (!headers)
    return NextResponse.json({ message: "Sign in to track the bridge." }, { status: 401 });
  const requestId = request.nextUrl.searchParams.get("requestId") ?? "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(requestId))
    return NextResponse.json({ message: "Invalid request ID." }, { status: 400 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/bridge/status?requestId=${requestId}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(11000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Bridge status is unavailable." }, { status: 503 });
  }
}
