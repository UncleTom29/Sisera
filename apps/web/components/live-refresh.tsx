"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LiveRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setRefreshing(true);
      router.refresh();
      setUpdatedAt(new Date());
      window.setTimeout(() => setRefreshing(false), 900);
    };
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, router]);

  return (
    <button
      type="button"
      onClick={() => {
        setRefreshing(true);
        router.refresh();
        setUpdatedAt(new Date());
        window.setTimeout(() => setRefreshing(false), 900);
      }}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-3 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-100"
      aria-label="Refresh market data"
      title={updatedAt ? `Last refreshed ${updatedAt.toLocaleTimeString()}` : "Refresh market data"}
    >
      <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}
