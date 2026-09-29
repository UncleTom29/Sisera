import type { Metadata } from "next";
import { PageHeader } from "../../../../components/page-header";
import { CopilotChat } from "../../../../components/platform/copilot-chat";

export const metadata: Metadata = {
  title: "Sisera AI",
  description:
    "Evidence-backed market answers and conversational trading policies with deterministic risk checks.",
};

export const dynamic = "force-dynamic";

export default async function CopilotPage({
  searchParams,
}: { searchParams: Promise<{ asset?: string }> }) {
  const { asset } = await searchParams;
  return (
    <div>
      <PageHeader
        eyebrow="Intelligence / Sisera AI"
        title="Sisera AI"
        description="Ask why a market is moving, what changed, how a trade affects your portfolio, or describe a conditional order. Every answer is built from sourced evidence; orders become policies you approve."
      />
      <CopilotChat initialAsset={asset && /^[A-Za-z0-9.$:_-]{1,64}$/.test(asset) ? asset : null} />
    </div>
  );
}
