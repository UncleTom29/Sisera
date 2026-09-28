"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function MarketAutoRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (["/stocks", "/private-markets", "/markets", "/terminal", "/clawpump"].includes(pathname))
      return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [pathname, router]);
  return null;
}
