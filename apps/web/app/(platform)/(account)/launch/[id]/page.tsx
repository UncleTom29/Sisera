import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "../../../../../components/page-header";
import { LaunchMonitor } from "../../../../../components/platform/launch-studio";

export const metadata: Metadata = {
  title: "Launch monitor",
  description: "Curve progress, price discovery, liquidity and fees for a launch.",
};

export const dynamic = "force-dynamic";

export default async function LaunchMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageHeader
        eyebrow="Automation / Launch"
        title="Launch monitor"
        description="Curve position, graduation progress, liquidity, volume, fees and price relative to the paired stock."
        actions={
          <Link href="/launch" className="text-xs text-slate-400 hover:text-bone">
            ← Launch studio
          </Link>
        }
      />
      {/^[0-9a-f-]{36}$/.test(id) ? (
        <LaunchMonitor id={id} />
      ) : (
        <p className="p-6 text-sm text-slate-400">Unknown launch.</p>
      )}
    </div>
  );
}
