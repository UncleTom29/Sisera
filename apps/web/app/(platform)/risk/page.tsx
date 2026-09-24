import { StatusBadge } from "@sisera/ui";
import { Activity, ShieldAlert } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

export default function RiskPage() {
  const limits = [
    "Max order notional",
    "Max gross exposure",
    "Max net exposure",
    "Max position notional",
    "Max daily loss",
    "Max leverage",
  ];
  return (
    <div>
      <PageHeader
        eyebrow="Independent control"
        title="Risk command center"
        description="Pre-trade mandates, real-time limit utilization, circuit breakers, and stress scenarios."
        actions={<StatusBadge tone="positive">Engine fail-closed</StatusBadge>}
      />
      <div className="grid gap-px border-b border-line bg-line md:grid-cols-3">
        {["Limit breaches", "Orders blocked today", "Stale quote rejects"].map((label) => (
          <div key={label} className="bg-panel p-5">
            <p className="data-label">{label}</p>
            <p className="data-value mt-4 text-2xl text-slate-600">—</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Mandate utilization</span>
            <Activity size={14} className="text-slate-600" />
          </div>
          <div className="divide-y divide-line">
            {limits.map((limit) => (
              <div
                key={limit}
                className="grid grid-cols-[1fr_90px_90px] items-center px-4 py-4 text-xs"
              >
                <span className="text-slate-300">{limit}</span>
                <span className="data-value text-right text-slate-600">—</span>
                <span className="data-value text-right text-slate-700">/ —</span>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">
            Stress and scenarios
          </div>
          <div className="p-3">
            <EmptyState
              icon={ShieldAlert}
              title="Portfolio state required"
              copy="Scenario loss, liquidity stress, and concentration shocks require a reconciled portfolio snapshot."
              code="STRESS / BLOCKED"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
