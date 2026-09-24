import { Button } from "@sisera/ui";
import { BriefcaseBusiness, Download, Layers3 } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

export default function PortfolioPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Portfolio control"
        title="Portfolio truth"
        description="Consolidated positions, cash, realized and unrealized P&L, and reconciled venue balances."
        actions={
          <Button size="sm">
            <Download size={13} /> Export ledger
          </Button>
        }
      />
      <div className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
        {["Net asset value", "Gross exposure", "Net exposure", "Daily P&L"].map((label) => (
          <div key={label} className="border-r border-line p-5 last:border-r-0">
            <p className="data-label">{label}</p>
            <p className="data-value mt-4 text-xl text-slate-600">—</p>
            <p className="mt-2 text-[10px] text-slate-700">Awaiting reconciled balances</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_.6fr]">
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">Positions</div>
          <div className="p-3">
            <EmptyState
              icon={BriefcaseBusiness}
              title="No reconciled positions"
              copy="Positions appear only after an approved account is connected and the first reconciliation cycle succeeds."
              code="PORTFOLIO / EMPTY"
            />
          </div>
        </section>
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">Allocation</div>
          <div className="p-3">
            <EmptyState
              icon={Layers3}
              title="No allocation data"
              copy="Exposure charts remain empty until portfolio truth is available."
              code="EXPOSURE / EMPTY"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
