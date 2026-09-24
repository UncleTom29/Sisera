import { Button, StatusBadge } from "@sisera/ui";
import { Bot, Plus, Workflow } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

const stages = ["Draft", "Backtest", "Stress", "Paper", "Shadow", "Limited live", "Live"];
export default function AgentsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Governed automation"
        title="Agent operations"
        description="Strategies advance through evidence-based promotion stages. Agents submit proposals; policy and risk retain execution authority."
        actions={
          <Button variant="primary" size="sm">
            <Plus size={13} /> New manifest
          </Button>
        }
      />
      <div className="overflow-x-auto border-b border-line bg-panel px-4 py-5">
        <div className="flex min-w-[760px] items-center">
          {stages.map((stage, index) => (
            <div key={stage} className="flex flex-1 items-center">
              <div className="flex min-w-24 flex-col items-center">
                <span className="grid size-7 place-items-center border border-line-strong bg-slate-900 font-mono text-[10px] text-slate-400">
                  {index + 1}
                </span>
                <span className="mt-2 text-[10px] text-slate-500">{stage}</span>
              </div>
              {index < stages.length - 1 && <span className="h-px flex-1 bg-line" />}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[1.4fr_.6fr]">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-xs font-semibold">Runtime inventory</span>
            <StatusBadge>0 active</StatusBadge>
          </div>
          <div className="p-3">
            <EmptyState
              icon={Bot}
              title="No agent manifests"
              copy="Create a signed manifest with explicit instruments, capital limits, autonomy, and a kill-switch action."
              code="AGENT_RUNTIME / EMPTY"
            />
          </div>
        </section>
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">
            Governance events
          </div>
          <div className="p-3">
            <EmptyState
              icon={Workflow}
              title="No promotion events"
              copy="Approvals, demotions, pauses, and policy changes are recorded here."
              code="AGENT_LEDGER / EMPTY"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
