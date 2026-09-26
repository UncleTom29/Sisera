"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LiveRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [configuredInterval, setConfiguredInterval] = useState(intervalMs);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sisera_refresh_interval_ms"));
    if ([0, 15000, 30000, 60000].includes(saved)) setConfiguredInterval(saved);
    let active = true;
    void fetch("/api/preferences", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const value = payload?.data?.refreshIntervalMs;
        if (active && [0, 15000, 30000, 60000].includes(value)) {
          setConfiguredInterval(value);
          window.localStorage.setItem("sisera_refresh_interval_ms", String(value));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setRefreshing(true);
      router.refresh();
      setUpdatedAt(new Date());
      window.setTimeout(() => setRefreshing(false), 900);
    };
    if (configuredInterval === 0) return;
    const timer = window.setInterval(refresh, configuredInterval);
    return () => window.clearInterval(timer);
  }, [configuredInterval, router]);

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
