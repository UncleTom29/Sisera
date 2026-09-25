import { StatusBadge } from "@sisera/ui";
import { Activity, Database, Globe2, RadioTower } from "lucide-react";
import { PageHeader } from "../../../components/page-header";

const sources = [
  {
    name: "Federal Reserve Economic Data",
    key: "FRED_API_KEY",
    scope: "Rates · inflation · liquidity",
  },
  { name: "U.S. Treasury Fiscal Data", key: null, scope: "Debt · cash balance · issuance" },
  { name: "DeFiLlama", key: null, scope: "Stablecoins · TVL · chain flows" },
  { name: "Venue funding feeds", key: null, scope: "Funding · basis · open interest" },
];

export default function MacroPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Cross-asset regime"
        title="Macro & chain monitor"
        description="Point-in-time macro, liquidity, derivatives, and onchain inputs with explicit source readiness and no retrospective model leakage."
        actions={<StatusBadge tone="warning">Connections required</StatusBadge>}
      />
      <div className="grid gap-4 p-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Source registry</span>
            <Database size={14} className="text-slate-600" />
          </div>
          <div className="divide-y divide-line">
            {sources.map((source) => {
              const configured = source.key ? Boolean(process.env[source.key]) : false;
              return (
                <div
                  key={source.name}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-200">{source.name}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{source.scope}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-1.5 rounded-full ${configured ? "bg-emerald-400" : "bg-amber-400"}`}
                    />
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
                      {configured ? "Configured" : "Adapter pending"}
                    </span>
                  </div>
                  <StatusBadge tone={configured ? "positive" : "warning"}>
                    {configured ? "Ready" : "No data"}
                  </StatusBadge>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="border border-line bg-[#091019]">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">Regime state</div>
          <div className="p-5">
            <Globe2 size={20} className="text-cyan-300" />
            <p className="mt-8 data-label">Current classification</p>
            <p className="mt-2 text-2xl font-medium text-slate-500">Unavailable</p>
            <p className="mt-4 text-xs leading-6 text-slate-600">
              Sisera will not infer a macro regime until the required point-in-time sources pass
              freshness and completeness checks.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-px bg-line">
              <StateCell icon={Activity} label="Rates" />
              <StateCell icon={RadioTower} label="Liquidity" />
              <StateCell icon={Database} label="Onchain" />
              <StateCell icon={Globe2} label="Derivatives" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StateCell({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return (
    <div className="bg-panel p-3">
      <Icon size={12} className="text-slate-700" />
      <p className="mt-3 data-label">{label}</p>
      <p className="mt-1 text-[9px] text-slate-700">No observation</p>
    </div>
  );
}
