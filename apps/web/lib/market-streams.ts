"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared WebSocket per exchange: opened on first subscriber, closed on the last, and reconnected
 * with backoff. Exchanges push every second, so crypto prices need no polling at all.
 */
function createStream<T>(options: {
  url: string;
  onOpen?: (socket: WebSocket) => void;
  onMessage: (data: unknown, state: Map<string, T>) => boolean;
}) {
  const state = new Map<string, T>();
  const listeners = new Set<() => void>();
  let socket: WebSocket | null = null;
  let retry = 0;
  let retryTimer: number | null = null;
  let version = 0;

  const connect = () => {
    retryTimer = null;
    // Handlers act only on their own socket, so a socket closed while still connecting can never
    // clear or send on the one that replaced it.
    const ws = new WebSocket(options.url);
    socket = ws;
    ws.onopen = () => {
      retry = 0;
      if (socket === ws) options.onOpen?.(ws);
    };
    ws.onmessage = (event) => {
      try {
        if (options.onMessage(JSON.parse(String(event.data)), state)) {
          version += 1;
          for (const listener of listeners) listener();
        }
      } catch {
        // Ignore frames we do not understand.
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (!listeners.size || retryTimer !== null) return;
      retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
    };
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (!socket && retryTimer === null) connect();
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      socket?.close();
      socket = null;
    };
  };

  return { state, subscribe, version: () => version };
}

export type SpotTick = {
  last: number;
  open: number;
  high: number;
  low: number;
  volumeUsd: number;
  change24hPct: number;
};

const binance = createStream<SpotTick>({
  url: "wss://data-stream.binance.vision/ws/!miniTicker@arr",
  onMessage: (data, state) => {
    if (!Array.isArray(data)) return false;
    for (const row of data as Array<Record<string, string>>) {
      const last = Number(row.c);
      const open = Number(row.o);
      if (!row.s || !Number.isFinite(last)) continue;
      state.set(row.s, {
        last,
        open,
        high: Number(row.h),
        low: Number(row.l),
        volumeUsd: Number(row.q),
        change24hPct: open > 0 ? (last / open - 1) * 100 : 0,
      });
    }
    return true;
  },
});

const hyperliquid = createStream<number>({
  url: "wss://api.hyperliquid.xyz/ws",
  onOpen: (socket) =>
    socket.send(JSON.stringify({ method: "subscribe", subscription: { type: "allMids" } })),
  onMessage: (data, state) => {
    const message = data as { channel?: string; data?: { mids?: Record<string, string> } };
    if (message.channel !== "allMids" || !message.data?.mids) return false;
    for (const [coin, mid] of Object.entries(message.data.mids)) state.set(coin, Number(mid));
    return true;
  },
});

/** Live Binance spot ticker for a symbol such as BTCUSDT, pushed every second. */
export function useSpotTick(symbol: string | null | undefined): SpotTick | undefined {
  return useSyncExternalStore(
    binance.subscribe,
    () => (symbol ? binance.state.get(symbol) : undefined),
    () => undefined,
  );
}

/** Every Binance spot ticker; re-renders on each push, so use it for whole-market tables. */
export function useSpotTicks(): Map<string, SpotTick> {
  useSyncExternalStore(binance.subscribe, binance.version, () => 0);
  return binance.state;
}

/** Live Hyperliquid mid price for a perpetual such as BTC. */
export function usePerpMid(coin: string | null | undefined): number | undefined {
  return useSyncExternalStore(
    hyperliquid.subscribe,
    () => (coin ? hyperliquid.state.get(coin) : undefined),
    () => undefined,
  );
}
