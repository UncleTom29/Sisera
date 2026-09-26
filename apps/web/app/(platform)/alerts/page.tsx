import { auth } from "../../../auth";
import { ActivityAlerts } from "../../../components/activity-alerts";
import { PageHeader } from "../../../components/page-header";
import { getMarketOrders, getPredictionOrders, getSolanaOrders } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [orders, marketOrders, predictionOrders] = await Promise.all([
    getSolanaOrders(identity).catch(() => null),
    getMarketOrders(identity).catch(() => null),
    getPredictionOrders(identity).catch(() => null),
  ]);
  const alerts = [...(orders ?? []), ...(marketOrders ?? []), ...(predictionOrders ?? [])]
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
          {orders || marketOrders || predictionOrders ? (
            <ActivityAlerts alerts={alerts} />
          ) : (
            <p className="p-5 text-xs text-amber-300">
              Activity ledger unavailable; alert status cannot be verified.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
