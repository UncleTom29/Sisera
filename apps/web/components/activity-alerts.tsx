"use client";

import { useEffect, useState } from "react";

type AccountAlert = {
  id: string;
  source: string;
  sourceId: string;
  status: string;
  detail: Record<string, string>;
  occurredAt: string;
  acknowledgedAt: string | null;
};

export function ActivityAlerts() {
  const [alerts, setAlerts] = useState<AccountAlert[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetch("/api/alert-acknowledgements", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Account alerts cannot be checked right now.");
          const payload = await response.json();
          if (active) {
            setAlerts(payload.data);
            setMessage(null);
            setReady(true);
          }
        })
        .catch((error) => {
          if (active) {
            setAlerts([]);
            setMessage(error instanceof Error ? error.message : "Alerts are unavailable.");
            setReady(true);
          }
        });
    };
    load();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const refreshTimer = window.setInterval(refreshVisible, 30_000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("sisera:session-renewed", load);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("sisera:session-renewed", load);
    };
  }, []);
  const active = alerts.filter((alert) => !alert.acknowledgedAt);
  async function acknowledge(id: string) {
    setMessage(null);
    try {
      const response = await fetch("/api/alert-acknowledgements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Acknowledgement could not be saved.");
      setAlerts((previous) =>
        previous.map((alert) =>
          alert.id === id ? { ...alert, acknowledgedAt: new Date().toISOString() } : alert,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Acknowledgement failed.");
    }
  }
  return (
    <div className="divide-y divide-line">
      {message && (
        <p role="alert" className="p-4 text-xs text-amber-300">
          {message}
        </p>
      )}
      {!ready ? (
        <p className="p-5 text-xs text-slate-400">Checking account alerts…</p>
      ) : active.length ? (
        active.map((alert) => (
          <div key={alert.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs font-semibold text-rose-300">
                {alert.source === "bridge_transfers" ? "Bridge delayed" : `Order ${alert.status}`}
              </p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                {new Date(alert.occurredAt).toLocaleString()} ·{" "}
                {alert.detail.symbol ??
                  alert.detail.marketId ??
                  alert.detail.requestId ??
                  alert.sourceId}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void acknowledge(alert.id)}
              className="rounded border border-line px-3 py-2 text-xs text-bronze-300"
            >
              Acknowledge
            </button>
          </div>
        ))
      ) : (
        !message && <p className="p-5 text-xs text-slate-400">No unacknowledged account alerts.</p>
      )}
    </div>
  );
}
