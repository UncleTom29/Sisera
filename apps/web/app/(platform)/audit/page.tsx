import { StatusBadge } from "@sisera/ui";
import { Fingerprint, Network } from "lucide-react";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";

export default function AuditPage() {
  return (
    <div className="min-h-full">
      <PageHeader
        eyebrow="Decision provenance"
        title="Decision ledger"
        description="Decision events require a persistent, authenticated audit sink. No empty screen is presented as an immutable ledger."
        actions={<StatusBadge tone="warning">Audit sink not connected</StatusBadge>}
      />
      <div className="p-4">
        <section className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <Fingerprint size={13} className="text-cyan-300" /> Audit stream
            </span>
            <span className="data-label">Persistence pending</span>
          </div>
          <div className="grid grid-cols-[150px_110px_1fr_180px_90px] border-b border-line bg-[#090e14] px-4 py-2 data-label">
            <span>Time</span>
            <span>Actor</span>
            <span>Action</span>
            <span>Correlation</span>
            <span>Integrity</span>
          </div>
          <EmptyState
            icon={Network}
            title="No recorded decisions"
            copy="No persistent audit events are available. Hash chaining and integrity status are not claimed until the audit pipeline is implemented."
            code="DECISION_LEDGER / EMPTY"
          />
        </section>
      </div>
    </div>
  );
}
