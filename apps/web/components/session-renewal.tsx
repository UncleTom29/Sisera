"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SessionRenewal() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !authenticated) return;
    let nextAttemptAt = 0;
    let lastSyncedToken: string | null = null;
    let cancelled = false;
    const controller = new AbortController();
    const renew = async () => {
      if (Date.now() < nextAttemptAt) return;
      nextAttemptAt = Date.now() + 30_000;
      try {
        const accessToken = await getAccessToken();
        if (!accessToken || cancelled) return;
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken }),
          signal: controller.signal,
        });
        if (!response.ok || cancelled) return;
        nextAttemptAt = Date.now() + 10 * 60_000;
        if (lastSyncedToken !== accessToken) {
          lastSyncedToken = accessToken;
          window.dispatchEvent(new Event("sisera:session-renewed"));
          router.refresh();
        }
      } catch {
        // The next visible interval retries; server routes still validate the cookie.
      }
    };
    const whenVisible = () => {
      if (document.visibilityState === "visible") void renew();
    };
    void renew();
    const timer = window.setInterval(whenVisible, 10 * 60_000);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, [ready, authenticated, getAccessToken, router]);

  return null;
}
