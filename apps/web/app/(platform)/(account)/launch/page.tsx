import type { Metadata } from "next";
import { PageHeader } from "../../../../components/page-header";
import { LaunchStudio } from "../../../../components/platform/launch-studio";

export const metadata: Metadata = {
  title: "Launch",
  description:
    "Launch an agent token through Clawpump or a stock-paired Meteora Dynamic Bonding Curve market.",
};

export const dynamic = "force-dynamic";

export default async function LaunchPage({
  searchParams,
}: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  return (
    <div>
      <PageHeader
        eyebrow="Automation / Launch"
        title="Launch studio"
        description="Turn a Sisera agent into an onchain asset. Clawpump launches the agent token; Meteora DBC forms a programmable, stock-aware market around it. Your wallet signs and pays; Sisera never holds keys."
      />
      <LaunchStudio agentId={agent && /^custom:[0-9a-f-]{36}$/.test(agent) ? agent : null} />
    </div>
  );
}
