"use client";

import { useEffect, useState } from "react";

export function ActivityAlerts({
  alerts,
}: { alerts: Array<{ id: string; status: string; createdAt: string }> }) {
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/alert-acknowledgements", { cache: "no-store" }),
      fetch("/api/preferences", { cache: "no-store" }),
    ])
      .then(async ([acks, preferences]) => {
        if (!acks.ok || !preferences.ok)
          throw new Error("Alert state cannot be verified right now.");
        const [ackPayload, prefPayload] = await Promise.all([acks.json(), preferences.json()]);
        if (active) {
          setAcknowledged(ackPayload.data);
          setEnabled(prefPayload.data.failedOrderAlerts);
          setReady(true);
        }
      })
      .catch((error) => {
        if (active)
          setMessage(error instanceof Error ? error.message : "Alert state is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);
  const active = enabled ? alerts.filter((alert) => !acknowledged.includes(alert.id)) : [];
  async function acknowledge(id: string) {
    setMessage(null);
    try {
      const response = await fetch("/api/alert-acknowledgements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Acknowledgement could not be saved.");
      setAcknowledged((previous) => [...previous, id]);
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
        <p className="p-5 text-xs text-slate-400">Checking account alert state…</p>
      ) : active.length ? (
        active.map((alert) => (
          <div key={alert.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs font-semibold text-rose-300">Order {alert.status}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                {new Date(alert.createdAt).toLocaleString()} · {alert.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void acknowledge(alert.id)}
              className="rounded border border-line px-3 py-2 text-xs text-cyan-300"
            >
              Acknowledge
            </button>
          </div>
        ))
      ) : (
        <p className="p-5 text-xs text-slate-400">No unacknowledged order alerts.</p>
      )}
    </div>
  );
}
