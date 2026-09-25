import { StatusBadge } from "@sisera/ui";
import { Activity, Ban, CircleGauge, ShieldAlert, Siren, Waves } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

const limits = [
  "Order notional",
  "Position concentration",
  "Gross exposure",
  "Net exposure",
  "Daily loss",
  "Portfolio leverage",
];
const scenarios = [
  { name: "Crypto liquidity shock", detail: "BTC −12% · ETH −16% · depth −70%" },
  { name: "Stablecoin dislocation", detail: "USDC −8% · spreads ×5" },
  { name: "Macro volatility spike", detail: "Rates +75bp · vol ×2 · USD +3%" },
];

export default function RiskPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Independent control function"
        title="Risk command center"
        description="Pre-trade mandates, real-time limit utilization, stress testing, circuit breakers, and kill-switch authority."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone="positive">Engine fail-closed</StatusBadge>
            <button
              type="button"
              disabled
              className="flex h-8 items-center gap-2 border border-rose-500/30 bg-rose-500/[0.06] px-3 text-[10px] font-semibold text-rose-300/50"
            >
              <Siren size={12} /> Global halt
            </button>
          </div>
        }
      />
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Risk state", value: "Protected", tone: "text-emerald-300", icon: CircleGauge },
          { label: "Breaches", value: "—", tone: "text-slate-600", icon: ShieldAlert },
          { label: "Blocked orders", value: "—", tone: "text-slate-600", icon: Ban },
          { label: "Quote freshness", value: "Live only", tone: "text-cyan-300", icon: Activity },
        ].map((item) => (
          <div key={item.label} className="bg-panel p-5">
            <div className="flex items-center justify-between">
              <p className="data-label">{item.label}</p>
              <item.icon size={13} className="text-slate-700" />
            </div>
            <p className={`data-value mt-4 text-xl ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Mandate utilization</span>
            <span className="data-label">Portfolio required</span>
          </div>
          <div className="divide-y divide-line">
            {limits.map((limit) => (
              <div
                key={limit}
                className="grid grid-cols-[1fr_110px_90px] items-center gap-4 px-4 py-4"
              >
                <div>
                  <p className="text-[11px] text-slate-300">{limit}</p>
                  <div className="mt-2 h-1 max-w-sm bg-slate-800" />
                </div>
                <span className="data-value text-right text-[10px] text-slate-600">— used</span>
                <span className="data-value text-right text-[10px] text-slate-700">/ — limit</span>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Stress library</span>
            <Waves size={13} className="text-slate-600" />
          </div>
          <div className="divide-y divide-line">
            {scenarios.map((scenario) => (
              <div
                key={scenario.name}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                <div>
                  <p className="text-[11px] font-medium text-slate-300">{scenario.name}</p>
                  <p className="mt-1 font-mono text-[9px] text-slate-600">{scenario.detail}</p>
                </div>
                <button
                  type="button"
                  disabled
                  className="h-7 border border-line px-3 text-[9px] text-slate-700"
                >
                  Run
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-line p-3">
            <EmptyState
              icon={ShieldAlert}
              title="Portfolio state required"
              copy="Scenario loss and margin projections run only against a reconciled snapshot."
              code="STRESS / BLOCKED"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
