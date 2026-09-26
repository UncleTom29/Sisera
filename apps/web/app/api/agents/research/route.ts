import { type NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { serverApiUrl } from "../../../../lib/server-api-url";

export async function GET(request: NextRequest) {
  const session = await auth();
  const local =
    process.env.SISERA_LOCAL_OPERATOR_MODE === "true" && process.env.NODE_ENV !== "production";
  if (!session && !local)
    return NextResponse.json({ message: "Sign in to run research." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{3,60}$/.test(id))
    return NextResponse.json({ message: "Invalid agent template." }, { status: 400 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/agents/templates/${id}/research`, {
      headers: session
        ? { authorization: `Bearer ${session.accessToken}` }
        : { "x-sisera-dev-role": "viewer", "x-sisera-dev-subject": "web-local" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "Agent research is temporarily unavailable." },
      { status: 503 },
    );
  }
}
