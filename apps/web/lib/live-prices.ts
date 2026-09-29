"use client";

import { useSyncExternalStore } from "react";

export type LivePrice = {
  usd: number;
  change24hPct: number | null;
  underlyingUsd: number | null;
  at: number;
};

// One poll per tab, shared by every component that shows a live Solana token price. Polling runs
// once a second while anything is subscribed and the tab is visible.
const listeners = new Set<() => void>();
let prices: Record<string, LivePrice> = {};
let timer: number | null = null;
let inFlight = false;

async function poll() {
  if (inFlight || document.visibilityState !== "visible") return;
  inFlight = true;
  try {
    const response = await fetch("/api/live/prices", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as { data?: Record<string, LivePrice> };
    if (payload.data) {
      prices = { ...prices, ...payload.data };
      for (const listener of listeners) listener();
    }
  } catch {
    // The next tick retries.
  } finally {
    inFlight = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    void poll();
    timer = window.setInterval(() => void poll(), 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** The latest live price for a Solana token mint, refreshed every second. */
export function useLivePrice(mint: string | null | undefined): LivePrice | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (mint ? prices[mint] : undefined),
    () => undefined,
  );
}

/** Every live Solana token price; re-renders once a second, so use it for whole tables. */
export function useLivePrices(): Record<string, LivePrice> {
  return useSyncExternalStore(
    subscribe,
    () => prices,
    () => emptyPrices,
  );
}
const emptyPrices: Record<string, LivePrice> = {};
