"use client";

import { useEffect, useState } from "react";

export function BridgeActivity() {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const saved = window.localStorage.getItem("sisera:last-bridge-request");
    if (saved && /^0x[a-fA-F0-9]{64}$/.test(saved)) setRequestId(saved);
  }, []);
  async function refresh() {
    if (!requestId) return;
    try {
      const response = await fetch(`/api/bridge?requestId=${encodeURIComponent(requestId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      setStatus(response.ok ? payload.data.status : (payload.message ?? "Status unavailable"));
    } catch {
      setStatus("Status unavailable");
    }
  }
  return (
    <section className="mt-4 border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
        USDC bridge
      </h2>
      {requestId ? (
        <div className="p-4 text-xs text-slate-300">
          <p className="break-all font-mono text-[10px]">Relay request {requestId}</p>
          <p className="mt-2">{status ?? "Refresh to check the latest destination status."}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 rounded border border-line px-3 py-2 text-cyan-300"
          >
            Refresh status
          </button>
        </div>
      ) : (
        <p className="p-5 text-xs text-slate-400">No bridge initiated in this browser.</p>
      )}
    </section>
  );
}
