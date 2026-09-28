import { StatusBadge } from "@sisera/ui";
import { Target } from "lucide-react";
import { auth } from "../../../auth";
import { EmptyState } from "../../../components/empty-state";
import { PageHeader } from "../../../components/page-header";
import { PredictionBrowser } from "../../../components/prediction-browser";
import { PredictionPaperAccount } from "../../../components/prediction-paper-account";
import { accountErrorMessage, getPredictionMarkets } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const session = await auth();
  const result = await getPredictionMarkets({
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  }).then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );
  const markets = result.value ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Outcome markets"
        title="Prediction markets"
        description="Explore outcome markets, understand how each question resolves and practice decisions before putting money at risk."
        actions={
          <StatusBadge tone={markets.length ? "positive" : "negative"}>
            {markets.length
              ? `${markets.length} snapshots`
              : result.error
                ? "Refreshing markets"
                : "Explore outcomes"}
          </StatusBadge>
        }
      />
      <div className="p-4">
        <PredictionPaperAccount />
        {markets.length ? (
          <PredictionBrowser markets={markets} />
        ) : (
          <EmptyState
            icon={Target}
            title="Explore what could happen next"
            copy={
              result.error
                ? accountErrorMessage(result.error)
                : "Markets are refreshing. Use the practice account above to explore how outcome trading works."
            }
          />
        )}
      </div>
    </div>
  );
}
