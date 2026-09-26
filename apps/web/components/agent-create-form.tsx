"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AgentCreateForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  async function submit(formData: FormData) {
    setWorking(true);
    setMessage(null);
    const body = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      universe: String(formData.get("universe") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      timeframe: String(formData.get("timeframe") ?? "1h"),
      capitalLimitUsd: Number(formData.get("capitalLimitUsd")),
      maxTradeNotionalUsd: Number(formData.get("maxTradeNotionalUsd")),
      maxDailyDrawdownPct: Number(formData.get("maxDailyDrawdownPct")),
    };
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? "Could not save the agent.");
      setMessage("Draft agent saved. It cannot trade until it passes the promotion pipeline.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the agent.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <form action={submit} className="space-y-3 border border-line bg-panel p-5">
      <h2 className="text-sm font-semibold text-white">Create a strategy agent</h2>
      <p className="text-xs text-slate-400">
        New agents start in Draft with proposal-only authority.
      </p>
      <input
        name="name"
        required
        minLength={3}
        maxLength={80}
        placeholder="Strategy name"
        className="w-full rounded border border-line bg-ink p-2 text-xs"
      />
      <textarea
        name="description"
        required
        minLength={20}
        maxLength={1000}
        placeholder="Entry, exit and abstain rules"
        className="min-h-24 w-full rounded border border-line bg-ink p-2 text-xs"
      />
      <input
        name="universe"
        required
        placeholder="BTCUSDT, ETHUSDT"
        className="w-full rounded border border-line bg-ink p-2 text-xs"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          Timeframe
          <select
            name="timeframe"
            className="mt-1 w-full rounded border border-line bg-ink p-2 text-slate-100"
          >
            <option>1h</option>
            <option>5m</option>
            <option>15m</option>
            <option>4h</option>
            <option>1d</option>
            <option>event</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Capital cap · USD
          <input
            name="capitalLimitUsd"
            type="number"
            min="1"
            max="1000000"
            defaultValue="10000"
            required
            className="mt-1 w-full rounded border border-line bg-ink p-2 text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-400">
          Trade cap · USD
          <input
            name="maxTradeNotionalUsd"
            type="number"
            min="1"
            max="100000"
            defaultValue="1000"
            required
            className="mt-1 w-full rounded border border-line bg-ink p-2 text-slate-100"
          />
        </label>
        <label className="text-xs text-slate-400">
          Daily drawdown · %
          <input
            name="maxDailyDrawdownPct"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            defaultValue="3"
            required
            className="mt-1 w-full rounded border border-line bg-ink p-2 text-slate-100"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!enabled || working}
        className="rounded bg-cyan-300 px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
      >
        {working ? "Saving…" : "Save draft agent"}
      </button>
      {!enabled && (
        <p className="text-xs text-amber-300">
          Sign in and connect the agent database to save custom agents.
        </p>
      )}
      {message && <output className="text-xs text-slate-300">{message}</output>}
    </form>
  );
}
