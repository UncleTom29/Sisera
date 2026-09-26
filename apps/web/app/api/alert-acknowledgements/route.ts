import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../auth";
import { isSameOrigin } from "../../../lib/request-origin";
import { serverApiUrl } from "../../../lib/server-api-url";

export async function GET() {
  const session = await auth();
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json({ message: "Sign in to view alerts." }, { status: 401 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/alerts/acknowledgements`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Alert history is unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ message: "Request rejected." }, { status: 403 });
  const session = await auth();
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json({ message: "Sign in to acknowledge alerts." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id))
    return NextResponse.json({ message: "Invalid alert ID." }, { status: 400 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/alerts/${body.id}/acknowledge`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Alert acknowledgement failed." }, { status: 503 });
  }
}
