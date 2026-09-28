"use client";

import { useEffect, useState } from "react";

// Full-day NYSE closures. Early closes are treated as full sessions.
const holidays = new Set([
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

type Session = { label: string; tone: "open" | "extended" | "closed" };

export function usSession(now: Date): Session {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (parts.weekday === "Sat" || parts.weekday === "Sun" || holidays.has(date))
    return { label: "US market closed", tone: "closed" };
  if (minutes >= 570 && minutes < 960) return { label: "US market open", tone: "open" };
  if (minutes >= 240 && minutes < 570) return { label: "US pre-market", tone: "extended" };
  if (minutes >= 960 && minutes < 1200) return { label: "US after hours", tone: "extended" };
  return { label: "US market closed", tone: "closed" };
}

/** Shows the US equity session, since stock tokens trade around the clock but shares do not. */
export function MarketSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const update = () => setSession(usSession(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!session) return null;
  const dot =
    session.tone === "open"
      ? "bg-[var(--up)]"
      : session.tone === "extended"
        ? "bg-bronze-300"
        : "bg-slate-500";
  return (
    <span
      className="hidden items-center gap-2 border border-line px-2.5 py-1 font-mono text-[11px] text-slate-300 md:inline-flex"
      title="Tokenized stocks trade 24/7; the underlying shares trade on the US exchange schedule, so token prices can drift from the share price outside regular hours."
    >
      <span
        className={`size-1.5 rounded-full ${dot} ${session.tone === "open" ? "pulse-live" : ""}`}
      />
      {session.label}
    </span>
  );
}
