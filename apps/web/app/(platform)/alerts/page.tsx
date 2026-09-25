import { Bell, RadioTower } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

export default function AlertsPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Operational awareness"
        title="Alerts"
        description="Market, risk, execution, reconciliation, agent, and infrastructure alerts with acknowledgement and escalation state."
      />
      <div className="grid gap-4 p-4 xl:grid-cols-[1.4fr_.6fr]">
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">Active alerts</div>
          <EmptyState
            icon={Bell}
            title="No active alerts"
            copy="Alert policies remain quiet until an observed event crosses a configured threshold."
            code="ALERTS / CLEAR"
          />
        </section>
        <section className="border border-line bg-panel">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold">
            Delivery routes
          </div>
          <div className="p-4">
            <RadioTower size={16} className="text-slate-600" />
            <p className="mt-5 text-xs text-slate-300">No notification channel configured</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-600">
              Connect email, Slack, PagerDuty, or webhook routes through organization settings.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
