import { ActivityAlerts } from "../../../components/activity-alerts";
import { PageHeader } from "../../../components/page-header";

export default function AlertsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Operational awareness"
        title="Alerts"
        description="Uncertain orders and delayed bridges are checked against your account records. Acknowledgements follow you across devices."
      />
      <div className="p-4">
        <section className="border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-xs font-semibold">Account alerts</h2>
          <ActivityAlerts />
        </section>
      </div>
    </div>
  );
}
