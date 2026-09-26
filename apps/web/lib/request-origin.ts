import type { NextRequest } from "next/server";

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    return (
      originHost === new URL(request.url).host ||
      originHost === request.headers.get("x-forwarded-host") ||
      originHost === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
