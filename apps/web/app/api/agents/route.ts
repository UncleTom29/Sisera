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
      { message: "Sign in with your account to create an agent." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  try {
    const response = await fetch(`${serverApiUrl()}/v1/agents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Agent service is unavailable." }, { status: 503 });
  }
}
