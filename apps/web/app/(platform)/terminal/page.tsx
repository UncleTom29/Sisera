import { StatusBadge, formatMoney, formatPercent } from "@sisera/ui";
import { BarChart3, BookOpen, CandlestickChart, CircleOff, Gauge, Radio } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { MarketChart } from "../../../components/market-chart";
import { OrderTicket } from "../../../components/order-ticket";
import {
  getCandles,
  getMarket,
  getMarketIntelligence,
  getMarkets,
  getOrderBook,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

const universe = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default async function TerminalPage({
  searchParams,
}: { searchParams: Promise<{ symbol?: string; interval?: string }> }) {
  const parameters = await searchParams;
  const symbol = universe.includes(parameters.symbol ?? "")
    ? (parameters.symbol as string)
    : "BTCUSDT";
  const interval = intervals.includes(parameters.interval ?? "")
    ? (parameters.interval as string)
    : "15m";
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [marketResult, universeResult, candlesResult, depthResult, intelligenceResult] =
    await Promise.allSettled([
      getMarket(symbol, identity),
      getMarkets(universe, identity),
      getCandles(symbol, interval, identity),
      getOrderBook(symbol, identity),
      getMarketIntelligence(symbol, identity),
    ]);
  const market = marketResult.status === "fulfilled" ? marketResult.value : null;
  const markets = universeResult.status === "fulfilled" ? universeResult.value.data : [];
  const candles = candlesResult.status === "fulfilled" ? candlesResult.value : [];
  const depth = depthResult.status === "fulfilled" ? depthResult.value : null;
  const intelligence = intelligenceResult.status === "fulfilled" ? intelligenceResult.value : null;
  const snapshot = market?.snapshot;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[#080c12]">
      <div className="hide-scrollbar flex h-8 shrink-0 items-center overflow-x-auto border-b border-line bg-[#060a0f]">
        {markets.length > 0 ? (
          markets.map(({ instrument, snapshot: item }) => (
            <Link
              key={instrument.id}
              href={`/terminal?symbol=${instrument.venueSymbol}&interval=${interval}`}
              className="flex h-full shrink-0 items-center gap-2 border-r border-line px-3 font-mono text-[9px] hover:bg-slate-900"
            >
              <span className="font-semibold text-slate-300">{instrument.baseAsset}</span>
              <span className="text-slate-500">{formatCompact(item.last)}</span>
              <span
                className={
                  Number(item.change24hPct ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                }
              >
                {formatPercent(item.change24hPct)}
              </span>
            </Link>
          ))
        ) : (
          <span className="px-3 font-mono text-[9px] uppercase tracking-wider text-slate-700">
            Live market tape unavailable · no synthetic fallback
          </span>
        )}
      </div>

      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-[#090e14] px-4 py-2">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-orange-400/15 font-mono text-sm font-bold text-orange-300">
              {market?.instrument.baseAsset.slice(0, 1) ?? "?"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-white">
                  {market?.instrument.displaySymbol ?? symbol}
                </span>
                <StatusBadge>{market?.instrument.type ?? "spot"}</StatusBadge>
              </div>
              <p className="mt-1 font-mono text-[8px] uppercase tracking-widest text-slate-600">
                {market?.instrument.venue ?? "provider unavailable"} · normalized instrument
              </p>
            </div>
          </div>
          <Metric
            label="Last"
            value={formatMoney(snapshot?.last)}
            tone={Number(snapshot?.change24hPct ?? 0) >= 0 ? "up" : "down"}
          />
          <Metric
            label="24h"
            value={formatPercent(snapshot?.change24hPct)}
            tone={Number(snapshot?.change24hPct ?? 0) >= 0 ? "up" : "down"}
          />
          <Metric label="Volume" value={formatCompact(snapshot?.volume24h)} />
          <Metric
            label="Spread"
            value={snapshot ? (Number(snapshot.ask) - Number(snapshot.bid)).toFixed(2) : "—"}
          />
        </div>
        {snapshot ? (
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-400 pulse-live" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-300">
              Live · {snapshot.quality.latencyMs}ms
            </span>
          </div>
        ) : (
          <StatusBadge tone="negative">Market data unavailable</StatusBadge>
        )}
      </div>

      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(500px,1fr)_286px_310px] lg:grid-rows-[minmax(520px,1fr)_180px]">
        <section className="min-h-[560px] border-b border-line bg-[#090d13] lg:min-h-0 lg:border-r">
          <div className="flex h-10 items-center justify-between border-b border-line px-3">
            <div className="flex items-center gap-1">
              {intervals.map((value) => (
                <Link
                  key={value}
                  href={`/terminal?symbol=${symbol}&interval=${value}`}
                  className={`grid h-6 min-w-8 place-items-center px-1.5 font-mono text-[9px] ${interval === value ? "bg-cyan-400/10 text-cyan-300" : "text-slate-600 hover:text-slate-300"}`}
                >
                  {value}
                </Link>
              ))}
              <span className="mx-2 h-4 w-px bg-line" />
              <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <CandlestickChart size={13} /> Candles
              </span>
            </div>
            <span className="font-mono text-[8px] uppercase tracking-wider text-slate-700">
              UTC · source verified
            </span>
          </div>
          {candles.length > 0 ? (
            <MarketChart candles={candles} />
          ) : (
            <div className="p-3">
              <EmptyState
                icon={CircleOff}
                title="Historical stream unavailable"
                copy="The chart remains blank because Sisera never invents candle data."
                code="CANDLES / UNAVAILABLE"
              />
            </div>
          )}
        </section>

        <section className="min-h-[520px] border-b border-line bg-[#080c12] lg:min-h-0 lg:border-r">
          <div className="flex h-10 items-center justify-between border-b border-line px-3">
            <span className="flex items-center gap-2 text-[11px] font-semibold">
              <BookOpen size={13} className="text-slate-600" /> Order book
            </span>
            <span className="font-mono text-[8px] text-slate-700">L2 · 20</span>
          </div>
          {depth ? (
            <OrderBookPanel bids={depth.bids} asks={depth.asks} />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Depth unavailable"
              copy="The approved venue did not return order-book depth."
              code="DEPTH / UNAVAILABLE"
            />
          )}
        </section>

        <aside className="min-h-[520px] border-b border-line bg-[#090d13] lg:min-h-0">
          <OrderTicket bid={snapshot?.bid} ask={snapshot?.ask} symbol={symbol} />
        </aside>

        <section className="border-b border-line bg-[#080c12] lg:col-span-2 lg:border-b-0 lg:border-r">
          <div className="flex h-9 items-center gap-6 border-b border-line px-4 text-[10px]">
            <span className="h-full border-b border-cyan-300 pt-3 text-cyan-300">
              Market intelligence
            </span>
            <span className="pt-0.5 text-slate-600">Positions</span>
            <span className="pt-0.5 text-slate-600">Orders</span>
            <span className="pt-0.5 text-slate-600">Fills</span>
            <span className="pt-0.5 text-slate-600">Funding</span>
          </div>
          {intelligence ? (
            <div className="grid h-[140px] grid-cols-[180px_repeat(4,minmax(120px,1fr))] overflow-x-auto">
              <div className="border-r border-line p-4">
                <p className="data-label">Composite score</p>
                <p
                  className={`data-value mt-2 text-3xl ${intelligence.score >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {intelligence.score.toFixed(1)}
                </p>
                <p className="mt-2 font-mono text-[9px] uppercase text-slate-600">
                  {intelligence.regime.replace("_", " ")} ·{" "}
                  {(intelligence.confidence * 100).toFixed(0)}% confidence
                </p>
              </div>
              {intelligence.signals.map((signal) => (
                <div key={signal.id} className="border-r border-line p-4">
                  <p className="data-label">{signal.label}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="data-value text-lg text-slate-200">
                      {signal.value.toFixed(2)}
                    </span>
                    <span
                      className={
                        signal.direction === "bullish"
                          ? "text-emerald-300"
                          : signal.direction === "bearish"
                            ? "text-rose-300"
                            : "text-slate-500"
                      }
                    >
                      {signal.direction}
                    </span>
                  </div>
                  <div className="mt-3 h-1 bg-slate-800">
                    <div
                      className={`h-full ${signal.score >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                      style={{ width: `${Math.min(Math.abs(signal.score), 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid h-[140px] place-items-center text-[10px] text-slate-700">
              Intelligence waits for verified candles.
            </div>
          )}
        </section>

        <section className="bg-[#080c12]">
          <div className="flex h-9 items-center justify-between border-b border-line px-3">
            <span className="flex items-center gap-2 text-[10px] font-semibold text-slate-300">
              <Gauge size={12} /> Execution status
            </span>
            <span className="font-mono text-[8px] text-amber-300">PAPER</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            <StatusCell label="OMS" value="Ready" />
            <StatusCell label="Risk" value="Fail closed" />
            <StatusCell label="Portfolio" value="Not connected" muted />
            <StatusCell label="Venue routing" value="Disabled" muted />
          </div>
        </section>
      </div>
    </div>
  );
}

function OrderBookPanel({
  bids,
  asks,
}: {
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
}) {
  const visibleAsks = [...asks].slice(0, 9).reverse();
  const visibleBids = bids.slice(0, 9);
  const max = Math.max(
    ...[...visibleAsks, ...visibleBids].map((level) => Number(level.quantity)),
    1,
  );
  return (
    <div className="font-mono text-[10px]">
      <div className="grid grid-cols-3 border-b border-line px-3 py-2 text-slate-700">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {visibleAsks.map((level, index) => (
        <DepthRow
          key={`a-${level.price}`}
          level={level}
          max={max}
          side="ask"
          total={visibleAsks
            .slice(0, index + 1)
            .reduce((sum, item) => sum + Number(item.quantity), 0)}
        />
      ))}
      <div className="flex h-8 items-center justify-center border-y border-line bg-slate-900/50 text-[9px] text-slate-500">
        Spread
      </div>
      {visibleBids.map((level, index) => (
        <DepthRow
          key={`b-${level.price}`}
          level={level}
          max={max}
          side="bid"
          total={visibleBids
            .slice(0, index + 1)
            .reduce((sum, item) => sum + Number(item.quantity), 0)}
        />
      ))}
    </div>
  );
}

function DepthRow({
  level,
  max,
  side,
  total,
}: {
  level: { price: string; quantity: string };
  max: number;
  side: "bid" | "ask";
  total: number;
}) {
  return (
    <div className="relative grid h-6 grid-cols-3 items-center px-3">
      <span className={`relative z-10 ${side === "bid" ? "text-emerald-300" : "text-rose-300"}`}>
        {Number(level.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </span>
      <span className="relative z-10 text-right text-slate-400">
        {Number(level.quantity).toFixed(4)}
      </span>
      <span className="relative z-10 text-right text-slate-600">{total.toFixed(3)}</span>
      <span
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-emerald-400/[0.09]" : "bg-rose-400/[0.09]"}`}
        style={{ width: `${(Number(level.quantity) / max) * 100}%` }}
      />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="hidden border-l border-line pl-5 sm:block">
      <p className="data-label">{label}</p>
      <p
        className={`data-value mt-1 text-[11px] ${tone === "up" ? "text-emerald-300" : tone === "down" ? "text-rose-300" : "text-slate-300"}`}
      >
        {value}
      </p>
    </div>
  );
}
function StatusCell({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="bg-[#090d13] p-3">
      <p className="data-label">{label}</p>
      <p className={`mt-2 text-[10px] ${muted ? "text-slate-600" : "text-emerald-300"}`}>{value}</p>
    </div>
  );
}
function formatCompact(value?: string | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(
    number,
  );
}
