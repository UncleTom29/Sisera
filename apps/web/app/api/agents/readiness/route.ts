import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { serverApiUrl } from "../../../../lib/server-api-url";

export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^custom:[0-9a-f-]{36}$/.test(id))
    return NextResponse.json({ message: "Invalid agent id." }, { status: 400 });
  const session = await auth();
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json({ message: "Sign in to inspect your agent." }, { status: 401 });
  try {
    const response = await fetch(
      `${serverApiUrl()}/v1/agents/${encodeURIComponent(id)}/readiness`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Readiness check is unavailable." }, { status: 503 });
  }
}
