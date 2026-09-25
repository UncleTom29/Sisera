import { StatusBadge } from "@sisera/ui";
import { Radio, Target } from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { getPredictionMarkets } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const session = await auth();
  const localOperator = process.env.SISERA_LOCAL_OPERATOR_MODE === "true";
  const markets = await getPredictionMarkets({
    accessToken: session?.accessToken,
    localOperator,
  }).catch(() => []);
  return (
    <div>
      <PageHeader
        eyebrow="Outcome markets"
        title="Prediction markets"
        description="Public Polymarket Gamma event snapshots with outcomes, close time, and fetch time. Prices are not executable quotes."
        actions={
          <StatusBadge tone={markets.length ? "positive" : "negative"}>
            {markets.length ? `${markets.length} market snapshots` : "Provider unavailable"}
          </StatusBadge>
        }
      />
      <div className="p-4">
        {markets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Prediction-market feed unavailable"
            copy="No placeholder probabilities are shown. Verify API authorization and the Polymarket adapter."
            code="PREDICTION_DATA_UNAVAILABLE"
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {markets.map((market) => (
              <article key={market.id} className="border border-line bg-panel">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-slate-600">
                    <Radio size={11} className="text-emerald-300" /> {market.provider}
                  </span>
                  <StatusBadge tone="warning">Gamma snapshot</StatusBadge>
                </div>
                <div className="p-4">
                  <h2 className="min-h-12 text-sm font-semibold leading-5 text-slate-200">
                    {market.title}
                  </h2>
                  <div className="mt-5 space-y-2">
                    {market.outcomes.slice(0, 3).map((outcome) => (
                      <div
                        key={outcome.id}
                        className="flex items-center justify-between border border-line bg-[#080c12] px-3 py-2 text-xs"
                      >
                        <span className="truncate text-slate-400">{outcome.label}</span>
                        <span className="data-value ml-3 text-cyan-300">
                          {(Number(outcome.probability) * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-wider text-slate-700">
                    Closes{" "}
                    {market.closesAt ? new Date(market.closesAt).toLocaleString() : "when resolved"}
                  </p>
                  <p className="mt-2 font-mono text-[9px] text-slate-500">
                    Fetched {new Date(market.quality.receivedAt).toLocaleTimeString()} · not an
                    executable quote
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
