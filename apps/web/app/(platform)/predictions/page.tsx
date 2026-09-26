import type { PredictionMarket } from "@sisera/domain";
import { StatusBadge } from "@sisera/ui";
import { Radio, Target } from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { PredictionTradeTicket } from "../../../components/prediction-trade-ticket";
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
        description="Jupiter prediction markets with YES / NO prices and resolution context. Prices are observations, not executable quotes or calibrated probabilities."
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
            copy="Jupiter has not returned a verified prediction market snapshot. Try again shortly or configure a Jupiter API key for a higher rate limit."
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
                  <StatusBadge tone="warning">Jupiter snapshot</StatusBadge>
                </div>
                <div className="p-4">
                  <h2 className="min-h-12 text-sm font-semibold leading-5 text-slate-200">
                    {market.title}
                  </h2>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                    {market.category ?? "event"}
                    {market.underlyingProvider ? ` · ${market.underlyingProvider} liquidity` : ""}
                  </p>
                  <div className="mt-5 space-y-2">
                    {market.outcomes.slice(0, 3).map((outcome) => (
                      <div
                        key={outcome.id}
                        className="flex items-center justify-between border border-line bg-[#080c12] px-3 py-2 text-xs"
                      >
                        <span className="truncate text-slate-400">{outcome.label}</span>
                        <span className="data-value ml-3 text-cyan-300">
                          {Number(outcome.probability).toFixed(4)} USDC
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-line pt-3 text-[11px] leading-5 text-slate-400">
                    <PredictionAnalysis market={market} />
                    {market.resolutionRules ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-cyan-300">Resolution rules</summary>
                        <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-line text-slate-400">
                          {market.resolutionRules}
                        </p>
                      </details>
                    ) : null}
                  </div>
                  <a
                    href="https://jup.ag/prediction"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs text-cyan-300"
                  >
                    Open Jupiter ↗
                  </a>
                  <p className="mt-4 font-mono text-[9px] uppercase tracking-wider text-slate-700">
                    Closes{" "}
                    {market.closesAt ? new Date(market.closesAt).toLocaleString() : "when resolved"}
                  </p>
                  <p className="mt-2 font-mono text-[9px] text-slate-500">
                    Powered by Jupiter · fetched{" "}
                    {new Date(market.quality.receivedAt).toLocaleTimeString()} · not an executable
                    quote
                  </p>
                  {market.resolutionRules &&
                    market.closesAt &&
                    Date.parse(market.closesAt) > Date.now() && (
                      <PredictionTradeTicket marketId={market.id} />
                    )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PredictionAnalysis({ market }: { market: PredictionMarket }) {
  const yes = market.outcomes.find((outcome) => outcome.label === "YES");
  const no = market.outcomes.find((outcome) => outcome.label === "NO");
  const combinedCost = Number(yes?.probability) + Number(no?.probability);
  return (
    <>
      <p className="font-semibold text-slate-200">Market analysis</p>
      <p className="mt-1">
        Entry break-even before fees: YES {(Number(yes?.probability) * 100).toFixed(1)}% · NO{" "}
        {(Number(no?.probability) * 100).toFixed(1)}%.
      </p>
      <p className="mt-1">
        Buying both sides costs ${combinedCost.toFixed(3)} for $1 of resolution payout
        {combinedCost > 1 ? `, a ${((combinedCost - 1) * 100).toFixed(1)}% entry premium` : ""}.
      </p>
      {yes?.sellPrice && no?.sellPrice && (
        <p className="mt-1">
          Immediate exit spread: YES $
          {Math.max(0, Number(yes.probability) - Number(yes.sellPrice)).toFixed(3)} · NO $
          {Math.max(0, Number(no.probability) - Number(no.sellPrice)).toFixed(3)} per contract.
        </p>
      )}
      <p className="mt-1">
        These are venue prices, not independent outcome probabilities. Review depth and resolution
        rules before placing an order.
      </p>
    </>
  );
}
