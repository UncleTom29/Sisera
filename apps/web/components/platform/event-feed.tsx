"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type MarketEvent, ago, pct, platform } from "../../lib/platform";
import {
  CertaintyBadge,
  Loading,
  Note,
  Panel,
  SentimentDot,
  SeverityBadge,
  ghostButtonClass,
} from "./ui";

type Explanation = {
  asset: string;
  changePct: number | null;
  explanation: string[];
  evidenceStrength: "strong" | "weak" | "none";
  macroBackdrop: Array<{ headline: string; severity: string; certainty: string }>;
};

export function EventRow({ event }: { event: MarketEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line/60 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <SentimentDot sentiment={event.sentiment} />
        <CertaintyBadge certainty={event.certainty} />
        <SeverityBadge severity={event.severity} />
        <span className="font-mono text-[10px] uppercase text-slate-500">
          {event.primaryCategory.replace("_", " ")}
        </span>
        <span className="ml-auto font-mono text-[10px] text-slate-500">
          {ago(event.lastSeenAt)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-1.5 text-left text-[13px] leading-5 text-bone hover:text-bronze-200"
      >
        {event.headline}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        {event.corroboration} source{event.corroboration === 1 ? "" : "s"}
        {event.assets.length
          ? ` · ${event.assets
              .slice(0, 4)
              .map((asset) => asset.symbol)
              .join(", ")}`
          : ""}
      </p>
      {open && (
        <div className="mt-2 space-y-2 border-l border-line pl-3">
          {event.basis.map((line) => (
            <p key={line} className="text-[11px] text-slate-400">
              {line}
            </p>
          ))}
          <ul className="space-y-1">
            {event.sources.slice(0, 6).map((source) => (
              <li key={source.url} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-[10px] uppercase text-slate-500">
                  {source.tier.replace("_", " ")}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 truncate text-slate-300 hover:text-bronze-200"
                >
                  {source.publisher} <ExternalLink size={10} />
                </a>
                <span className="text-slate-600">{ago(source.publishedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/** Classified events for one asset, with an on-demand explanation of its latest move. */
export function AssetEventFeed({ assetKey, symbol }: { assetKey: string; symbol: string }) {
  const [events, setEvents] = useState<MarketEvent[] | null>(null);
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    let active = true;
    platform<{ events: MarketEvent[]; providers: Record<string, string> }>(
      `intelligence/assets/${encodeURIComponent(assetKey)}/events`,
    )
      .then((data) => {
        if (!active) return;
        setEvents(data.events);
        setProviders(data.providers);
      })
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [assetKey]);

  const explain = async () => {
    setExplaining(true);
    try {
      setExplanation(
        await platform<Explanation>(
          `intelligence/assets/${encodeURIComponent(assetKey)}/explain?window=24`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Explanation unavailable.");
    } finally {
      setExplaining(false);
    }
  };

  return (
    <Panel
      title="News, filings & events"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={ghostButtonClass}
            onClick={explain}
            disabled={explaining}
          >
            <Sparkles size={12} /> {explaining ? "Explaining…" : `Why is ${symbol} moving?`}
          </button>
          <Link
            href={`/copilot?asset=${encodeURIComponent(assetKey)}`}
            className={ghostButtonClass}
          >
            Ask Sisera AI
          </Link>
        </div>
      }
    >
      {explanation && (
        <div className="border-b border-line bg-ink/60 p-4">
          <p className="data-label text-bronze-300">
            24h move {pct(explanation.changePct)} · evidence {explanation.evidenceStrength}
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">
            {explanation.explanation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {explanation.macroBackdrop.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-500">
              Market backdrop: {explanation.macroBackdrop.map((item) => item.headline).join(" · ")}
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="p-3">
          <Note tone="warning">{error}</Note>
        </div>
      )}
      {!events && !error && <Loading label="Collecting news, filings and social posts…" />}
      {events && events.length === 0 && (
        <p className="p-4 text-xs text-slate-400">No classified events in the last two weeks.</p>
      )}
      {events && events.length > 0 && (
        <ul>
          {events.slice(0, 15).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      )}
      {Object.keys(providers).length > 0 && (
        <p className="border-t border-line px-4 py-2 font-mono text-[10px] text-slate-500">
          Sources:{" "}
          {Object.entries(providers)
            .map(([name, state]) => `${name} ${state.replace("_", " ")}`)
            .join(" · ")}
          . Certainty reflects source type and independent corroboration; rumors are never shown as
          confirmed.
        </p>
      )}
    </Panel>
  );
}

type Changes = {
  since: string;
  eventCount: number;
  highSeverity: number;
  events: Array<
    MarketEvent & { coincidentMoves: Array<{ symbol: string; changePct: number | null }> }
  >;
  largestMoves: Array<{ symbol: string; changePct: number | null; windowLabel: string }>;
};

/** Market-wide "what changed" across tracked assets and macro headlines. */
export function ChangesFeed() {
  const [minutes, setMinutes] = useState(60);
  const [data, setData] = useState<Changes | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    platform<Changes>(`intelligence/changes?minutes=${minutes}`)
      .then((value) => active && setData(value))
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, [minutes]);
  return (
    <Panel
      title="What changed"
      actions={
        <div className="flex border border-line">
          {[
            [60, "1h"],
            [240, "4h"],
            [1440, "24h"],
            [10080, "7d"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMinutes(Number(value))}
              className={`px-3 py-1 text-xs ${minutes === value ? "bg-bronze-300 text-ink" : "text-slate-300 hover:text-bone"}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {error && (
        <div className="p-3">
          <Note tone="warning">{error}</Note>
        </div>
      )}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="border-b border-line px-4 py-2 text-xs text-slate-400">
            {data.eventCount} events · {data.highSeverity} high severity or worse
            {data.largestMoves.length > 0 &&
              ` · largest moves: ${data.largestMoves
                .slice(0, 5)
                .map((move) => `${move.symbol} ${pct(move.changePct)}`)
                .join(", ")}`}
          </p>
          <ul>
            {data.events.slice(0, 20).map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
          {data.events.length === 0 && (
            <p className="p-4 text-xs text-slate-400">No new events in this window.</p>
          )}
        </>
      )}
    </Panel>
  );
}
