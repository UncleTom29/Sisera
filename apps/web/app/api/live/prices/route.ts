import { NextResponse } from "next/server";
import { serverApiUrl } from "../../../../lib/server-api-url";

// Every open tab polls this once a second. One upstream request serves all of them: the snapshot
// is reused for up to 900ms, and concurrent callers share the in-flight request.
let snapshot: { at: number; body: string } | null = null;
let pending: Promise<string> | null = null;

async function load(): Promise<string> {
  const response = await fetch(`${serverApiUrl()}/v1/live/prices`, {
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Live prices returned ${response.status}`);
  return response.text();
}

export async function GET() {
  if (!snapshot || Date.now() - snapshot.at > 900) {
    pending ??= load().finally(() => {
      pending = null;
    });
    try {
      snapshot = { at: Date.now(), body: await pending };
    } catch {
      if (!snapshot) return NextResponse.json({ data: {}, at: Date.now() }, { status: 503 });
    }
  }
  return new NextResponse(snapshot.body, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
