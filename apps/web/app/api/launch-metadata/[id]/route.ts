import { NextResponse } from "next/server";
import { serverApiUrl } from "../../../../lib/server-api-url";

/** Public token metadata for Meteora DBC launches; wallets and explorers fetch this URI. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/launches/${id}/metadata`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(await response.json(), {
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
