import { StatusBadge } from "@sisera/ui";
import { auth } from "../../../auth";
import { AgentCreateForm } from "../../../components/agent-create-form";
import { AgentResearch } from "../../../components/agent-research";
import { PageHeader } from "../../../components/page-header";
import { getAgents } from "../../../lib/api";

export const dynamic = "force-dynamic";

const stages = ["Draft", "Backtest", "Stress", "Paper", "Shadow", "Limited live", "Live"];

export default async function AgentsPage() {
  const session = await auth();
  const agents = await getAgents({
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  }).catch(() => null);
  const account = Boolean(
    session &&
      !session.accessToken.startsWith("guest:") &&
      !session.accessToken.startsWith("wallet:"),
  );
  return (
    <div>
      <PageHeader
        eyebrow="Governed strategies / Draft"
        title="Agents"
        description="Five research strategy templates and your custom proposal agents. Promotion requires backtesting, stress testing, paper and shadow evaluation before live authority."
        actions={
          <StatusBadge tone="neutral">{agents?.custom.length ?? 0} custom drafts</StatusBadge>
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
        <div className="space-y-4">
          <section className="border border-line bg-panel">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Strategy templates
            </h2>
            <div className="grid gap-3 p-3 md:grid-cols-2">
              {agents?.templates.map((agent) => (
                <article key={agent.id} className="border border-line bg-ink p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
                    <StatusBadge tone="neutral">Research</StatusBadge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{agent.description}</p>
                  <p className="mt-3 font-mono text-[10px] text-cyan-300">
                    {agent.universe.join(" · ")} · {agent.timeframe}
                  </p>
                  <ul className="mt-3 list-inside list-disc space-y-1 text-[11px] text-slate-400">
                    {agent.factors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-line pt-3 text-[10px] leading-5 text-amber-200/80">
                    {agent.risk}
                  </p>
                  <AgentResearch id={agent.id} />
                </article>
              )) ?? <p className="p-4 text-xs text-amber-300">Agent service unavailable.</p>}
            </div>
          </section>
          <section className="border border-line bg-panel">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Your custom agents
            </h2>
            {agents?.custom.length ? (
              <div className="divide-y divide-line">
                {agents.custom.map((agent) => (
                  <article key={agent.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-white">{agent.name}</h3>
                      <StatusBadge tone="warning">{agent.stage}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{agent.policy.description}</p>
                    <p className="mt-2 font-mono text-[10px] text-slate-500">
                      {agent.policy.universe?.join(" · ")} · {agent.policy.timeframe} · proposal
                      only
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-5 text-xs text-slate-400">No custom agents saved yet.</p>
            )}
          </section>
        </div>
        <AgentCreateForm enabled={account && agents?.persistence === "postgres"} />
      </div>
    </div>
  );
}
