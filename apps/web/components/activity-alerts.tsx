"use client";

import { useEffect, useState } from "react";

export function ActivityAlerts({
  alerts,
}: { alerts: Array<{ id: string; status: string; createdAt: string }> }) {
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    try {
      setAcknowledged(JSON.parse(localStorage.getItem("sisera_alert_acknowledged") ?? "[]"));
    } catch {
      setAcknowledged([]);
    }
    setEnabled(localStorage.getItem("sisera_failed_order_alerts") !== "false");
  }, []);
  const active = enabled ? alerts.filter((alert) => !acknowledged.includes(alert.id)) : [];
  function acknowledge(id: string) {
    const next = [...acknowledged, id];
    setAcknowledged(next);
    localStorage.setItem("sisera_alert_acknowledged", JSON.stringify(next.slice(-100)));
  }
  return (
    <div className="divide-y divide-line">
      {active.length ? (
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
              onClick={() => acknowledge(alert.id)}
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
