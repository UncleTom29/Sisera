import { auth } from "../../../auth";
import { ActivityAlerts } from "../../../components/activity-alerts";
import { PageHeader } from "../../../components/page-header";
import {
  accountErrorMessage,
  getMarketOrders,
  getPredictionOrders,
  getSolanaOrders,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [solana, market, prediction] = await Promise.allSettled([
    getSolanaOrders(identity),
    getMarketOrders(identity),
    getPredictionOrders(identity),
  ]);
  const unavailable = [
    ["Solana", solana],
    ["Spot and perpetual", market],
    ["Prediction", prediction],
  ].flatMap(([label, result]) =>
    typeof result === "object" &&
    result !== null &&
    "status" in result &&
    result.status === "rejected"
      ? [`${label}: ${accountErrorMessage(result.reason)}`]
      : [],
  );
  const alerts = [
    ...(solana.status === "fulfilled" ? solana.value : []),
    ...(market.status === "fulfilled" ? market.value : []),
    ...(prediction.status === "fulfilled" ? prediction.value : []),
  ]
    .filter((order) => ["failed", "unknown", "rejected"].includes(order.status))
    .map((order) => ({ id: order.id, status: order.status, createdAt: order.createdAt }));
  return (
    <div>
      <PageHeader
        eyebrow="Operational awareness"
        title="Alerts"
        description="Failed or uncertain recorded orders are shown here until acknowledged for your account."
      />
      <div className="p-4">
        <section className="border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-xs font-semibold">Order alerts</h2>
          {unavailable.length > 0 && (
            <div className="border-b border-amber-400/30 p-4 text-xs text-amber-200">
              Alert coverage is incomplete. {unavailable.join(" ")}
            </div>
          )}
          {unavailable.length < 3 && <ActivityAlerts alerts={alerts} />}
        </section>
      </div>
    </div>
  );
}
