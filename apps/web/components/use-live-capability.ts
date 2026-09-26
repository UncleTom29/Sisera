"use client";

import { useEffect, useState } from "react";

type Venue = "solana" | "predictions" | "binance" | "hyperliquid";
type Capabilities = { live?: Partial<Record<Venue, boolean>> };

let pending: Promise<Capabilities> | null = null;

function loadCapabilities(): Promise<Capabilities> {
  pending ??= fetch("/api/capabilities", { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<Capabilities>) : { live: {} }))
    .catch(() => ({ live: {} }));
  return pending;
}

export function useLiveCapability(venue: Venue): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void loadCapabilities().then((capabilities) => {
      if (active) setEnabled(capabilities.live?.[venue] === true);
    });
    return () => {
      active = false;
    };
  }, [venue]);
  return enabled;
}
