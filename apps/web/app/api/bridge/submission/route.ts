import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { isSameOrigin } from "../../../../lib/request-origin";
import { serverApiUrl } from "../../../../lib/server-api-url";

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
    return NextResponse.json({ message: "Sign in to track this bridge." }, { status: 401 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/bridge/submission`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Bridge submission could not be recorded." },
      { status: 503 },
    );
  }
}
