import { StatusBadge, formatMoney, formatPercent } from "@sisera/ui";
import {
  type Activity,
  ArrowDownUp,
  BookOpen,
  CandlestickChart,
  CircleOff,
  Clock3,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { getMarket } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function TerminalPage() {
  const session = await auth();
  const localOperator = process.env.SISERA_LOCAL_OPERATOR_MODE === "true";
  const market = await getMarket("BTCUSDT", {
    accessToken: session?.accessToken,
    localOperator,
  }).catch(() => null);
  const snapshot = market?.snapshot;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line bg-[#080c12] px-4 py-2">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-white">BTC / USDT</span>
              <StatusBadge>Spot</StatusBadge>
            </div>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-600">
              Binance · normalized instrument
            </p>
          </div>
          <span className="h-7 w-px bg-line" />
          <div>
            <p className="data-value text-sm text-slate-100">{formatMoney(snapshot?.last)}</p>
            <p
              className={`data-value mt-0.5 text-[10px] ${Number(snapshot?.change24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}
            >
              {formatPercent(snapshot?.change24hPct)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {snapshot ? (
            <>
              <StatusBadge tone="positive">
                <span className="mr-1 size-1.5 bg-emerald-300 pulse-live" /> Live
              </StatusBadge>
              <span className="font-mono text-[9px] text-slate-600">
                {snapshot.quality.latencyMs} ms · {snapshot.quality.source}
              </span>
            </>
          ) : (
            <StatusBadge tone="negative">Data unavailable</StatusBadge>
          )}
        </div>
      </div>

      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[210px_minmax(380px,1fr)_240px_270px]">
        <section className="border-b border-line bg-[#070b10] lg:border-b-0 lg:border-r">
          <PanelTitle title="Markets" icon={Radio} meta="1 source" />
          <div className="border-b border-line px-3 py-2">
            <input
              aria-label="Search markets"
              placeholder="Filter instruments"
              className="h-8 w-full border border-line bg-panel px-3 text-[11px] text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-500/50"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] border-b border-line bg-slate-900/30 px-3 py-2 data-label">
            <span>Instrument</span>
            <span>Last / 24h</span>
          </div>
          <button
            type="button"
            className="grid w-full grid-cols-[1fr_auto] border-b border-line bg-cyan-400/[0.04] px-3 py-3 text-left"
          >
            <span>
              <span className="block text-xs font-semibold text-slate-200">BTC / USDT</span>
              <span className="mt-1 block font-mono text-[9px] uppercase text-slate-600">
                Binance · Spot
              </span>
            </span>
            <span className="text-right">
              <span className="data-value block text-[11px] text-slate-200">
                {snapshot?.last ?? "—"}
              </span>
              <span
                className={`data-value mt-1 block text-[10px] ${Number(snapshot?.change24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}
              >
                {formatPercent(snapshot?.change24hPct)}
              </span>
            </span>
          </button>
          <div className="p-3">
            <p className="data-label">Universe status</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-600">
              Only instruments confirmed by the instrument master appear here.
            </p>
          </div>
        </section>

        <section className="min-h-[460px] border-b border-line bg-ink lg:min-h-0 lg:border-b-0 lg:border-r">
          <PanelTitle title="Price" icon={CandlestickChart} meta="No aggregation fallback" />
          <div className="grid grid-cols-4 border-b border-line">
            {[
              ["Bid", snapshot?.bid],
              ["Ask", snapshot?.ask],
              [
                "Spread",
                snapshot ? (Number(snapshot.ask) - Number(snapshot.bid)).toFixed(2) : null,
              ],
              ["24h volume", snapshot?.volume24h],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-line px-3 py-3 last:border-r-0">
                <p className="data-label">{label}</p>
                <p className="data-value mt-2 truncate text-[12px] text-slate-300">
                  {value ?? "—"}
                </p>
              </div>
            ))}
          </div>
          <div className="p-3">
            <EmptyState
              icon={snapshot ? Clock3 : CircleOff}
              title={snapshot ? "Historical stream not subscribed" : "Market data unavailable"}
              copy={
                snapshot
                  ? "The live top-of-book is verified. Connect a candle stream before rendering historical price action."
                  : "The terminal does not generate placeholder prices. Check API authorization and the approved provider connection."
              }
              code={snapshot ? "STREAM / CANDLES / DISCONNECTED" : "MARKET_DATA_UNAVAILABLE"}
            />
          </div>
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
            <OperationalCell label="Data policy" value="Fail closed" tone="positive" />
            <OperationalCell
              label="Snapshot source"
              value={snapshot?.quality.source ?? "Unavailable"}
            />
            <OperationalCell
              label="Observation"
              value={
                snapshot
                  ? new Date(snapshot.quality.observedAt).toLocaleTimeString("en-US", {
                      hour12: false,
                    })
                  : "—"
              }
            />
          </div>
        </section>

        <section className="border-b border-line bg-[#070b10] lg:border-b-0 lg:border-r">
          <PanelTitle title="Market depth" icon={BookOpen} meta="L2" />
          <div className="grid grid-cols-3 border-b border-line px-3 py-2 data-label">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>
          <EmptyState
            icon={ArrowDownUp}
            title="Order book not subscribed"
            copy="Top-of-book remains available above. Full depth requires the streaming adapter."
            code="DEPTH / DISCONNECTED"
          />
        </section>

        <aside className="bg-[#080c12]">
          <PanelTitle title="Paper order" icon={ShieldCheck} meta="Risk gated" />
          <div className="p-4">
            <div className="grid grid-cols-2 border border-line">
              <button
                type="button"
                className="h-9 bg-emerald-500/10 text-xs font-semibold text-emerald-300"
              >
                Buy
              </button>
              <button
                type="button"
                className="h-9 border-l border-line text-xs font-semibold text-slate-500"
              >
                Sell
              </button>
            </div>
            <label className="mt-5 block">
              <span className="data-label">Order type</span>
              <select className="mt-2 h-9 w-full border border-line bg-panel px-3 text-xs text-slate-300 outline-none">
                <option>Market</option>
                <option>Limit</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="data-label">Quantity · BTC</span>
              <input
                inputMode="decimal"
                placeholder="0.00000"
                className="data-value mt-2 h-9 w-full border border-line bg-panel px-3 text-right text-xs outline-none placeholder:text-slate-700"
              />
            </label>
            <div className="mt-5 space-y-2 border-y border-line py-4 text-[11px]">
              <TicketRow label="Indicative price" value={snapshot?.ask ?? "—"} />
              <TicketRow label="Estimated notional" value="—" />
              <TicketRow label="Buying power" value="—" />
              <TicketRow label="Max slippage" value="Policy" />
            </div>
            <button
              type="button"
              disabled
              className="mt-5 h-10 w-full border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-500"
            >
              Load portfolio mandate to continue
            </button>
            <div className="mt-4 flex gap-2 border border-amber-500/20 bg-amber-500/[0.06] p-3">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-[10px] leading-4 text-amber-100/60">
                Submission stays disabled until portfolio truth and risk limits are loaded from the
                control plane.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelTitle({
  title,
  icon: Icon,
  meta,
}: { title: string; icon: typeof Activity; meta: string }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-line px-3">
      <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
        <Icon size={13} className="text-slate-600" />
        {title}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-wider text-slate-700">{meta}</span>
    </div>
  );
}
function OperationalCell({
  label,
  value,
  tone,
}: { label: string; value: string; tone?: "positive" }) {
  return (
    <div className="bg-[#080c12] p-3">
      <p className="data-label">{label}</p>
      <p
        className={`data-value mt-2 text-[11px] ${tone === "positive" ? "text-emerald-300" : "text-slate-400"}`}
      >
        {value}
      </p>
    </div>
  );
}
function TicketRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="data-value text-slate-300">{value}</span>
    </div>
  );
}
