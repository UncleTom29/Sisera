"use client";

import { useEffect, useState } from "react";

export function WorkspaceSettings() {
  const [interval, setIntervalValue] = useState("30000");
  const [failedOrders, setFailedOrders] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("sisera_refresh_interval_ms");
    if (stored && ["0", "15000", "30000", "60000"].includes(stored)) setIntervalValue(stored);
    setFailedOrders(localStorage.getItem("sisera_failed_order_alerts") !== "false");
  }, []);
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <section className="border border-line bg-panel p-5">
        <h2 className="text-sm font-semibold text-white">Market refresh</h2>
        <p className="mt-2 text-xs text-slate-400">
          Choose how often open market views refresh while this tab is visible.
        </p>
        <select
          value={interval}
          onChange={(event) => {
            setIntervalValue(event.target.value);
            localStorage.setItem("sisera_refresh_interval_ms", event.target.value);
          }}
          className="mt-4 w-full rounded border border-line bg-ink p-2 text-xs text-white"
        >
          <option value="0">Manual only</option>
          <option value="15000">15 seconds</option>
          <option value="30000">30 seconds</option>
          <option value="60000">60 seconds</option>
        </select>
      </section>
      <section className="border border-line bg-panel p-5">
        <h2 className="text-sm font-semibold text-white">Activity alerts</h2>
        <label className="mt-4 flex items-center gap-3 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={failedOrders}
            onChange={(event) => {
              setFailedOrders(event.target.checked);
              localStorage.setItem("sisera_failed_order_alerts", String(event.target.checked));
            }}
          />
          Show failed and uncertain order alerts
        </label>
        <p className="mt-3 text-[11px] text-slate-500">
          Preferences are saved in this browser. Order status still appears in Activity.
        </p>
      </section>
    </div>
  );
}
