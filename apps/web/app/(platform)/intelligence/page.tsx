import { StatusBadge } from "@sisera/ui";
import { Activity, CircleOff, Compass, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { StockIntelligence } from "../../../components/stock-intelligence";
import { getMarket, getMarketIntelligence } from "../../../lib/api";

export const dynamic = "force-dynamic";
const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

export default async function IntelligencePage({
  searchParams,
}: { searchParams: Promise<{ universe?: string }> }) {
  const { universe } = await searchParams;
  if (universe !== "perps") return <StockIntelligence />;
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const [market, intelligence] = await Promise.all([
        getMarket(symbol, identity, "hyperliquid"),
        getMarketIntelligence(symbol, identity, "hyperliquid"),
      ]);
      return { symbol, market, intelligence };
    }),
  );
  const rows = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Hyperliquid perpetuals · verified candles"
        title="Market intelligence"
        description="Technical, momentum, volatility, and participation signals compiled from verified candles into explainable directional evidence."
        actions={
          <StatusBadge tone={rows.length ? "positive" : "negative"}>
            {rows.length ? `${rows.length} instruments scored` : "Data unavailable"}
          </StatusBadge>
        }
      />
      <div className="grid gap-4 p-4 xl:grid-cols-[1.45fr_.55fr]">
        <section className="overflow-hidden border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Cross-market ranking</span>
            <span className="data-label">1h · 240 observations</span>
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[10px]">
                <thead className="bg-[#090e14] font-mono uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="h-10 px-4 font-normal">Market</th>
                    <th className="px-4 font-normal">Price</th>
                    <th className="px-4 font-normal">Composite</th>
                    <th className="px-4 font-normal">Regime</th>
                    <th className="px-4 font-normal">Direction</th>
                    <th className="px-4 font-normal">Confidence</th>
                    <th className="px-4 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .sort((left, right) => right.intelligence.score - left.intelligence.score)
                    .map(({ symbol, market, intelligence }) => (
                      <tr key={symbol} className="border-t border-line hover:bg-cyan-400/[0.025]">
                        <td className="h-14 px-4">
                          <p className="font-mono text-[11px] font-semibold text-slate-200">
                            {market.instrument.displaySymbol}
                          </p>
                          <p className="mt-1 text-[8px] uppercase text-slate-700">
                            {market.instrument.venue}
                          </p>
                        </td>
                        <td className="data-value px-4 text-slate-300">
                          ${Number(market.snapshot.last).toLocaleString()}
                        </td>
                        <td
                          className={`data-value px-4 text-sm ${intelligence.score >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                        >
                          {intelligence.score.toFixed(1)}
                        </td>
                        <td className="px-4">
                          <StatusBadge
                            tone={
                              intelligence.regime === "risk_on"
                                ? "positive"
                                : intelligence.regime === "risk_off"
                                  ? "negative"
                                  : "warning"
                            }
                          >
                            {intelligence.regime.replace("_", " ")}
                          </StatusBadge>
                        </td>
                        <td className="px-4">
                          <span
                            className={`inline-flex items-center gap-1 ${intelligence.direction === "long" ? "text-emerald-300" : intelligence.direction === "short" ? "text-rose-300" : "text-slate-500"}`}
                          >
                            {intelligence.direction === "long" ? (
                              <TrendingUp size={12} />
                            ) : intelligence.direction === "short" ? (
                              <TrendingDown size={12} />
                            ) : (
                              <Activity size={12} />
                            )}
                            {intelligence.direction}
                          </span>
                        </td>
                        <td className="data-value px-4 text-slate-400">
                          {(intelligence.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-4 text-right">
                          <Link
                            href={`/terminal?symbol=${symbol}&venue=hyperliquid`}
                            className="text-cyan-300 hover:text-cyan-200"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={CircleOff}
              title="Intelligence unavailable"
              copy="Signals are computed only when verified historical candles are available."
              code="INTELLIGENCE / NO INPUT"
            />
          )}
        </section>
        <aside className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">Methodology</div>
          <div className="p-4">
            <Compass size={18} className="text-cyan-300" />
            <h2 className="mt-6 text-lg font-medium tracking-tight text-white">
              Evidence before narrative.
            </h2>
            <p className="mt-3 text-xs leading-6 text-slate-400">
              Component signals, indicator regimes, sample size, observation time, and confidence
              are evaluated deterministically with transparent inputs.
            </p>
            <div className="mt-6 space-y-3">
              {[
                "EMA 12 / 26 trend differential",
                "RSI 14 momentum",
                "ATR 14 volatility regime",
                "20-period relative volume",
              ].map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-3 border-t border-line pt-3 text-[10px] text-slate-400"
                >
                  <span className="data-value text-cyan-300">0{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-8 border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[9px] leading-4 text-amber-100/60">
              Scores inform research and risk review. They never bypass the deterministic execution
              policy.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
