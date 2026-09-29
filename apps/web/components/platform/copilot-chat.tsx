"use client";

import { SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  type MarketEvent,
  type TradeImpact,
  type TradingPolicy,
  describeCondition,
  pct,
  platform,
  usd,
} from "../../lib/platform";
import { useSolanaSigner } from "../../lib/use-solana-signer";
import { EventRow } from "./event-feed";
import { PolicyList } from "./policy-list";
import { Note, buttonClass, ghostButtonClass, inputClass } from "./ui";

type Card = { type: string; title?: string; data: unknown };
type Reply = {
  intent: string;
  answer: string;
  cards: Card[];
  asset: { key: string; symbol: string; name: string } | null;
  provenance: { model: string; sources: string[] };
};
type Message = { role: "user" | "assistant"; content: string; reply?: Reply };

const EXAMPLES = [
  "Why is OpenAI trading above its mark?",
  "What changed in the last hour?",
  "Which tokenized stocks are trading furthest from fair value?",
  "Which of my positions are exposed to this news?",
  "What happens if I allocate $5,000 to NVDAx?",
  "Show me the strongest argument for and against buying Anthropic",
  "Which Clawpump agents are outperforming their paired stock?",
  "Buy $2,000 of OpenAI if the premium falls below 3%, liquidity remains above my threshold, and no high-severity negative event appears.",
];

function RankingCard({ title, data }: { title: string; data: unknown }) {
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : null;
  if (!rows) {
    const today = data as {
      gainers?: Array<Record<string, unknown>>;
      newLaunches?: Array<Record<string, unknown>>;
    };
    return (
      <div className="border border-line bg-ink p-3 text-xs text-slate-400">
        <p className="data-label mb-1 text-bronze-300">{title}</p>
        {today.gainers && (
          <p>
            Gainers:{" "}
            {today.gainers
              .slice(0, 6)
              .map((row) => `${row.symbol} ${pct(row.change24hPct as number)}`)
              .join(", ")}
          </p>
        )}
        {today.newLaunches && (
          <p className="mt-1">
            New launches:{" "}
            {today.newLaunches
              .slice(0, 6)
              .map((row) => row.symbol)
              .join(", ") || "none"}
          </p>
        )}
      </div>
    );
  }
  const columns = [
    "symbol",
    "premiumPct",
    "relativePerformancePct",
    "change24hPct",
    "liquidityUsd",
    "top10WalletPct",
    "riskScore",
  ].filter((column) => rows.some((row) => row[column] != null));
  return (
    <div className="overflow-x-auto border border-line bg-ink">
      <p className="data-label border-b border-line px-3 py-2 text-bronze-300">{title}</p>
      <table className="w-full min-w-[420px] text-left text-[11px]">
        <thead className="text-[10px] uppercase text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-1.5 font-medium">
                {column
                  .replace(/Pct$/, " %")
                  .replace(/Usd$/, " $")
                  .replace(/([A-Z])/g, " $1")
                  .toLowerCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num text-slate-300">
          {rows.slice(0, 10).map((row) => (
            <tr key={String(row.mint ?? row.symbol)} className="border-t border-line/50">
              {columns.map((column) => (
                <td key={column} className="px-3 py-1.5">
                  {column === "symbol" ? (
                    row.mint &&
                    ("relativePerformancePct" in row ||
                      "top10WalletPct" in row ||
                      "risk" in row) ? (
                      <Link
                        className="text-bronze-200 hover:underline"
                        href={`/clawpump/${String(row.mint)}`}
                      >
                        {String(row.symbol)}
                      </Link>
                    ) : (
                      String(row.symbol)
                    )
                  ) : column.endsWith("Usd") ? (
                    usd(row[column] as number)
                  ) : column.endsWith("Pct") ? (
                    pct(row[column] as number)
                  ) : (
                    String(row[column] ?? "—")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyDraftCard({ data, onCreated }: { data: unknown; onCreated: () => void }) {
  const compiled = data as {
    policy: TradingPolicy | null;
    description?: string;
    validation?: string[];
    errors?: string[];
    evaluation?: {
      status: string;
      triggers: Array<{
        condition: { type: string } & Record<string, unknown>;
        passed: boolean;
        actual: string | null;
        detail: string;
      }>;
    } | null;
    impact?: TradeImpact | null;
    rewritten?: string | null;
  };
  const signer = useSolanaSigner();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  if (!compiled.policy)
    return (
      <Note tone="warning">
        {(compiled.errors ?? ["The request could not be compiled."]).join(" ")}
      </Note>
    );
  const policy = compiled.policy;
  const save = async (activate: boolean) => {
    setState("saving");
    setError(null);
    try {
      await platform("policies", {
        body: { policy, activate, wallet: policy.action.mode === "live" ? signer.address : null },
      });
      setState("saved");
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The policy could not be saved.");
      setState("idle");
    }
  };
  return (
    <div className="space-y-2 border border-bronze-500/40 bg-ink p-3 text-xs">
      <p className="data-label text-bronze-300">Compiled policy · deterministic</p>
      <p className="text-slate-200">{compiled.description}</p>
      {compiled.rewritten && (
        <p className="text-[11px] text-slate-500">Interpreted as: “{compiled.rewritten}”</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(
          compiled.evaluation?.triggers ??
          policy.triggers.map((condition) => ({
            condition,
            passed: false,
            actual: null,
            detail: "",
          }))
        ).map((result) => (
          <span
            key={JSON.stringify(result.condition)}
            title={result.detail}
            className={`border px-1.5 py-0.5 font-mono text-[10px] ${result.passed ? "border-emerald-500/40 text-emerald-300" : "border-line text-slate-400"}`}
          >
            {describeCondition(result.condition)} {result.actual ? `(${result.actual})` : ""}
          </span>
        ))}
      </div>
      {compiled.validation?.map((item) => (
        <Note key={item} tone="warning">
          {item}
        </Note>
      ))}
      {compiled.impact?.impact.warnings.map((item) => (
        <Note key={item} tone={compiled.impact?.impact.blocked ? "error" : "warning"}>
          {item}
        </Note>
      ))}
      {error && <Note tone="error">{error}</Note>}
      {state === "saved" ? (
        <Note tone="positive">
          Saved. Sisera evaluates it every 30 seconds; nothing executes outside its conditions and
          your risk limits.
        </Note>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={
              state === "saving" ||
              Boolean(compiled.validation?.length) ||
              (policy.action.mode === "live" && !signer.address)
            }
            onClick={() => save(true)}
          >
            Activate policy
          </button>
          <button
            type="button"
            className={ghostButtonClass}
            disabled={state === "saving"}
            onClick={() => save(false)}
          >
            Save as draft
          </button>
        </div>
      )}
    </div>
  );
}

function CardView({ card, onPolicy }: { card: Card; onPolicy: () => void }) {
  switch (card.type) {
    case "policy_draft":
      return <PolicyDraftCard data={card.data} onCreated={onPolicy} />;
    case "ranking":
      return <RankingCard title={card.title ?? "Ranking"} data={card.data} />;
    case "changes": {
      const data = card.data as { events: MarketEvent[] };
      return (
        <ul className="border border-line bg-ink">
          {data.events.slice(0, 6).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      );
    }
    case "explanation": {
      const data = card.data as { candidates: MarketEvent[] };
      return data.candidates.length ? (
        <ul className="border border-line bg-ink">
          {data.candidates.slice(0, 4).map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      ) : null;
    }
    case "arguments": {
      const data = card.data as { bull: string[]; bear: string[] };
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="border border-emerald-500/30 bg-ink p-3 text-xs text-slate-300">
            <p className="data-label mb-1 text-emerald-300">For</p>
            <ul className="list-inside list-disc space-y-1">
              {data.bull.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="border border-rose-500/30 bg-ink p-3 text-xs text-slate-300">
            <p className="data-label mb-1 text-rose-300">Against</p>
            <ul className="list-inside list-disc space-y-1">
              {data.bear.slice(0, 5).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    case "impact": {
      const data = card.data as TradeImpact;
      return (
        <div className="border border-line bg-ink p-3 text-xs text-slate-300">
          <p className="num">
            {data.asset.symbol}: {data.impact.before.weightPct.toFixed(1)}% →{" "}
            {data.impact.after.weightPct.toFixed(1)}% · {data.sector.name}:{" "}
            {data.sector.beforePct.toFixed(1)}% → {data.sector.afterPct.toFixed(1)}% · NAV{" "}
            {usd(data.navUsd)}
          </p>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Sisera AI: evidence-backed answers and conversational policies that never trade on their own. */
export function CopilotChat({ initialAsset }: { initialAsset?: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextAsset, setContextAsset] = useState<string | null>(initialAsset ?? null);
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [threadId] = useState(() => crypto.randomUUID());
  const [policyRefresh, setPolicyRefresh] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const messageCount = messages.length;

  useEffect(() => {
    if (messageCount) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || working) return;
    setWorking(true);
    setError(null);
    setInput("");
    const history = messages.map((item) => ({ role: item.role, content: item.content }));
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const reply = await platform<Reply>("copilot/chat", {
        body: { message, history, contextAssetKey: contextAsset, threadId, mode },
      });
      if (reply.asset) setContextAsset(reply.asset.key);
      setMessages((current) => [...current, { role: "assistant", content: reply.answer, reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sisera AI is unavailable.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[1.35fr_.65fr]">
      <section className="flex min-h-[640px] flex-col border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-xs text-slate-400">
          <span>
            Context:{" "}
            {contextAsset ? <span className="text-bronze-200">{contextAsset}</span> : "none"}
          </span>
          {contextAsset && (
            <button
              type="button"
              className="text-slate-500 hover:text-bone"
              onClick={() => setContextAsset(null)}
            >
              clear
            </button>
          )}
          <label className="ml-auto flex items-center gap-2">
            Orders
            <select
              className="h-7 border border-line bg-ink px-2 text-xs"
              value={mode}
              onChange={(event) => setMode(event.target.value as "paper" | "live")}
            >
              <option value="paper">Paper</option>
              <option value="live">Live</option>
            </select>
          </label>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div>
              <p className="text-sm text-slate-300">
                Ask about any stock, private company, agent token or your portfolio. Conditional
                trades become policies you review before anything is armed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => send(example)}
                    className="border border-line px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:border-bronze-400 hover:text-bone"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={message.role === "user" ? "ml-auto max-w-[85%]" : "max-w-full"}
            >
              <div
                className={`whitespace-pre-line border p-3 text-[13px] leading-6 ${message.role === "user" ? "border-bronze-500/40 bg-bronze-500/10 text-bone" : "border-line bg-ink text-slate-200"}`}
              >
                {message.content}
              </div>
              {message.reply && (
                <div className="mt-2 space-y-2">
                  {message.reply.cards.map((card, cardIndex) => (
                    <CardView
                      key={`${card.type}-${cardIndex}`}
                      card={card}
                      onPolicy={() => setPolicyRefresh((value) => value + 1)}
                    />
                  ))}
                  <p className="font-mono text-[10px] text-slate-600">
                    {message.reply.intent.replace("_", " ")} · {message.reply.provenance.model} ·{" "}
                    {message.reply.provenance.sources.join(", ")}
                  </p>
                </div>
              )}
            </div>
          ))}
          {working && <p className="animate-pulse text-xs text-slate-500">Gathering evidence…</p>}
          {error && <Note tone="error">{error}</Note>}
          <div ref={end} />
        </div>
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <input
            className={inputClass}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Sisera AI…"
            aria-label="Message Sisera AI"
            maxLength={2000}
          />
          <button
            type="submit"
            className={buttonClass}
            disabled={working || !input.trim()}
            aria-label="Send"
          >
            <SendHorizontal size={14} />
          </button>
        </form>
      </section>
      <div className="space-y-4">
        <PolicyList refreshKey={policyRefresh} />
        <Note>
          Sisera AI reads market data, events, and your portfolio. It cannot sign or place orders.
          Policies are compiled deterministically, validated against your limits, and executed only
          through Sisera’s risk checks — live orders still need your wallet signature unless you
          delegated signing.
        </Note>
      </div>
    </div>
  );
}
