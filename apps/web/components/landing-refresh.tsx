"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LandingRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
