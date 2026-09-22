"use client";

import { useEffect, useRef, useState } from "react";

/** Minimal realtime hook: connects to the API WebSocket fan-out (spec §46). */
export function useRealtime(url: string, onMessage: (msg: unknown) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        if (!closed) setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          handler.current(JSON.parse(ev.data as string));
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [url]);

  return { connected };
}
