import { auth } from "../../../auth";
import { BridgeActivity } from "../../../components/bridge-activity";
import { HyperliquidActivity } from "../../../components/hyperliquid-activity";
import { PageHeader } from "../../../components/page-header";
import {
  accountErrorMessage,
  getMarketOrders,
  getPredictionOrders,
  getSolanaOrders,
} from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const session = await auth();
  const identity = {
    accessToken: session?.accessToken,
    localOperator: process.env.SISERA_LOCAL_OPERATOR_MODE === "true",
  };
  const [stockResult, marketResult, predictionResult] = await Promise.all([
    getSolanaOrders(identity).then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: null, error }),
    ),
    getMarketOrders(identity).then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: null, error }),
    ),
    getPredictionOrders(identity).then(
      (value) => ({ value, error: null as unknown }),
      (error: unknown) => ({ value: null, error }),
    ),
  ]);
  const orders = stockResult.value;
  const marketOrders = marketResult.value;
  const predictionOrders = predictionResult.value;
  return (
    <div>
      <PageHeader
        eyebrow="Account activity"
        title="Activity"
        description="Your recorded paper and live orders across Solana stocks, Binance spot, and Hyperliquid perps."
      />
      <div className="p-4">
        <section className="mb-4 border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
            Crypto market orders
          </h2>
          {marketOrders?.length ? (
            <div className="divide-y divide-line">
              {marketOrders
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                .map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[140px_80px_100px_1fr_110px] gap-3 px-4 py-3 font-mono text-[11px] text-slate-300"
                  >
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                    <span>{order.mode}</span>
                    <span
                      className={
                        order.status === "rejected" || order.status === "unknown"
                          ? "text-rose-300"
                          : "text-emerald-300"
                      }
                    >
                      {order.status}
                    </span>
                    <span>
                      {order.venue} · {order.symbol} · {order.side}
                    </span>
                    <span className="text-right">{order.quantity}</span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-400">
              {marketResult.error
                ? accountErrorMessage(marketResult.error)
                : "No crypto market orders yet."}
            </p>
          )}
        </section>
        <section className="border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
            Solana stock orders
          </h2>
          <div className="grid grid-cols-[140px_80px_100px_1fr_110px] gap-3 border-b border-line px-4 py-3 font-mono text-[10px] uppercase text-slate-500">
            <span>Time</span>
            <span>Mode</span>
            <span>Status</span>
            <span>Route</span>
            <span>Amount in</span>
          </div>
          {orders?.length ? (
            <div className="divide-y divide-line">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-[140px_80px_100px_1fr_110px] gap-3 px-4 py-3 font-mono text-[11px] text-slate-300"
                >
                  <span>{new Date(order.createdAt).toLocaleString()}</span>
                  <span>{order.mode}</span>
                  <span
                    className={
                      order.status === "failed" || order.status === "unknown"
                        ? "text-rose-300"
                        : "text-emerald-300"
                    }
                  >
                    {order.status}
                  </span>
                  <span className="truncate" title={`${order.inputMint} → ${order.outputMint}`}>
                    {order.inputMint.slice(0, 8)}… → {order.outputMint.slice(0, 8)}…
                    {order.signature && (
                      <a
                        className="ml-2 text-cyan-300"
                        href={`https://solscan.io/tx/${order.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Transaction ↗
                      </a>
                    )}
                  </span>
                  <span className="text-right">{order.inAmount}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-400">
              {stockResult.error
                ? accountErrorMessage(stockResult.error)
                : "No recorded orders yet."}
            </p>
          )}
        </section>
        <HyperliquidActivity />
        <BridgeActivity />
        <section className="mt-4 border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-white">
            Jupiter prediction orders
          </h2>
          {predictionOrders?.length ? (
            <div className="divide-y divide-line">
              {predictionOrders.map((order) => (
                <div
                  key={order.id}
                  className="grid grid-cols-[140px_90px_1fr_100px] gap-3 px-4 py-3 font-mono text-[11px] text-slate-300"
                >
                  <span>{new Date(order.createdAt).toLocaleString()}</span>
                  <span
                    className={
                      order.status === "failed" || order.status === "unknown"
                        ? "text-rose-300"
                        : "text-cyan-300"
                    }
                  >
                    {order.venueStatus ? `${order.status} · ${order.venueStatus}` : order.status}
                  </span>
                  <span>
                    {order.marketId} · {order.outcome.toUpperCase()}
                  </span>
                  <span className="text-right">
                    ${(Number(order.depositAmount) / 1_000_000).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-400">
              {predictionResult.error
                ? accountErrorMessage(predictionResult.error)
                : "No prediction orders yet."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
