import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { serverApiUrl } from "../../../lib/server-api-url";

export async function GET() {
  const session = await auth();
  if (
    !session ||
    session.accessToken.startsWith("guest:") ||
    session.accessToken.startsWith("wallet:")
  )
    return NextResponse.json({ message: "Sign in to view your paper account." }, { status: 401 });
  try {
    const response = await fetch(`${serverApiUrl()}/v1/prediction-orders/paper`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ message: "Paper account is unavailable." }, { status: 503 });
  }
}
