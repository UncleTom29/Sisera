import { StatusBadge } from "@sisera/ui";
import { BriefcaseBusiness, Download, Layers3, RefreshCcw, ShieldCheck } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { PortfolioConnect } from "../../../components/portfolio-connect";

export default function PortfolioPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Reconciled source of truth"
        title="Portfolio"
        description="Cross-venue cash, positions, margin, exposure, and P&L—accepted only after reconciliation."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone="warning">No source connected</StatusBadge>
            <PortfolioConnect />
          </div>
        }
      />
      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 xl:grid-cols-5">
        {["Net asset value", "Available cash", "Gross exposure", "Net exposure", "Today P&L"].map(
          (label) => (
            <div key={label} className="bg-panel p-5">
              <p className="data-label">{label}</p>
              <p className="data-value mt-4 text-2xl text-slate-600">—</p>
              <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-slate-700">
                Awaiting reconciliation
              </p>
            </div>
          ),
        )}
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.45fr_.55fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Positions</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 text-[9px] text-slate-700"
              >
                <RefreshCcw size={11} /> Reconcile
              </button>
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 text-[9px] text-slate-700"
              >
                <Download size={11} /> Export
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[1.4fr_repeat(5,1fr)] border-b border-line bg-[#090e14] px-4 py-2 data-label">
            <span>Instrument</span>
            <span className="text-right">Position</span>
            <span className="text-right">Entry</span>
            <span className="text-right">Mark</span>
            <span className="text-right">Unrealized</span>
            <span className="text-right">Exposure</span>
          </div>
          <EmptyState
            icon={BriefcaseBusiness}
            title="No reconciled positions"
            copy="Connect a portfolio source and complete its first balance and position reconciliation cycle."
            code="PORTFOLIO / EMPTY"
          />
        </section>
        <div className="space-y-4">
          <section className="border border-line bg-panel">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold">Allocation</div>
            <EmptyState
              icon={Layers3}
              title="No allocation data"
              copy="Allocation remains blank until portfolio truth is available."
              code="ALLOCATION / EMPTY"
            />
          </section>
          <section className="border border-emerald-500/15 bg-emerald-500/[0.035] p-4">
            <ShieldCheck size={16} className="text-emerald-300" />
            <h3 className="mt-4 text-xs font-semibold text-slate-200">
              Reconciliation is mandatory
            </h3>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              Venue balances are compared with Sisera’s double-entry ledger before positions can
              influence risk limits or order sizing.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
