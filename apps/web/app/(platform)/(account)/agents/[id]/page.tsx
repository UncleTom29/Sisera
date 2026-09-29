import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../../../../../components/page-header";
import { AgentDetail } from "../../../../../components/platform/agent-detail";

export const metadata: Metadata = {
  title: "Agent",
  description:
    "Evaluation evidence, promotion, autonomy, proposals and the decision trail for one agent.",
};

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = decodeURIComponent(id);
  return (
    <div>
      <PageHeader
        eyebrow="Automation / Agent"
        title="Agent"
        description="Every stage requires recorded evidence for this exact manifest version. Live stages need an independent risk manager, and circuit breakers pause or demote the agent automatically."
        actions={
          <Link href="/agents" className="text-xs text-slate-400 hover:text-bone">
            ← All agents
          </Link>
        }
      />
      {/^custom:[0-9a-f-]{36}$/.test(agentId) ? (
        <AgentDetail id={agentId} />
      ) : (
        <p className="p-6 text-sm text-slate-400">Unknown agent.</p>
      )}
    </div>
  );
}
