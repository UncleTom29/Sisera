import postgres from "postgres";
import { buildApi } from "../apps/api/dist/app.js";
import { readConfig } from "../apps/api/dist/config.js";
import {
  applyPredictionPaperOrder,
  createBridgeTransfer,
  getAccountPreferences,
  getBridgeTransfer,
  getPredictionPaperAccount,
  listAccountAlerts,
  listAccountEvents,
  listBridgeTransfers,
  listPredictionPaperOrders,
  markBridgeSourceSubmitted,
  saveAccountPreferences,
  updateBridgeTransferStatus,
} from "../packages/db/dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for account persistence verification.");

const suffix = crypto.randomUUID().replaceAll("-", "");
const subject = `migration-test:${suffix}`;
const otherSubject = `migration-test:other-${suffix}`;
const requestId = `0x${suffix.padEnd(64, "0")}`;
const sourceTxHash = `0x${suffix.padEnd(64, "1")}`;
const connection = postgres(databaseUrl, { max: 1, connect_timeout: 3 });

await createBridgeTransfer(databaseUrl, {
  requestId,
  tenantId: "migration-test",
  subject,
  originAddress: "0x1111111111111111111111111111111111111111",
  recipient: "0x2222222222222222222222222222222222222222",
  originChainId: 8453,
  destinationChainId: 999,
  originAmountUsdc: "10",
  quotedOutputUsdc: "9.9",
});
if (await getBridgeTransfer(databaseUrl, otherSubject, requestId))
  throw new Error("A bridge quote leaked across accounts.");
if (await markBridgeSourceSubmitted(databaseUrl, otherSubject, requestId, sourceTxHash))
  throw new Error("Another account could modify a bridge quote.");
if (!(await markBridgeSourceSubmitted(databaseUrl, subject, requestId, sourceTxHash)))
  throw new Error("Bridge submission was not recorded.");
await updateBridgeTransferStatus(databaseUrl, subject, requestId, "success", sourceTxHash, null);
await updateBridgeTransferStatus(databaseUrl, subject, requestId, "pending", null, null);
const transfers = await listBridgeTransfers(databaseUrl, subject);
if (transfers.length !== 1 || transfers[0]?.status !== "success")
  throw new Error("Bridge status was not persisted for its owner.");
const statuses = (await listAccountEvents(databaseUrl, subject)).map((event) => event.status);
if (!["quoted", "source_submitted", "success"].every((status) => statuses.includes(status)))
  throw new Error("Bridge transitions did not reach the account event timeline.");

const initial = await getAccountPreferences(databaseUrl, subject);
if (initial.leaderboardOptIn) throw new Error("Leaderboard participation was enabled by default.");
await saveAccountPreferences(databaseUrl, subject, {
  refreshIntervalMs: 30000,
  failedOrderAlerts: true,
  leaderboardOptIn: true,
});
await saveAccountPreferences(databaseUrl, subject, {
  refreshIntervalMs: 60000,
  failedOrderAlerts: true,
  leaderboardOptIn: undefined,
});
if (!(await getAccountPreferences(databaseUrl, subject)).leaderboardOptIn)
  throw new Error("An older preferences client cleared leaderboard consent.");

const predictionOrder = {
  id: crypto.randomUUID(),
  tenantId: "migration-test",
  subject,
  marketId: "MARKET-123",
  outcome: "yes",
  depositUsd: "10",
  fillPriceUsd: "0.4",
  closesAt: new Date(Date.now() + 86400000).toISOString(),
};
const settle = (state) => ({
  state: {
    cashUsd: String(Number(state.cashUsd) - 10),
    positions: { "MARKET-123:yes": { contracts: "24.875", costUsd: "10" } },
  },
  contracts: "24.875",
  feeUsd: "0.05",
});
await applyPredictionPaperOrder(databaseUrl, predictionOrder, settle);
await applyPredictionPaperOrder(databaseUrl, predictionOrder, () => {
  throw new Error("Duplicate prediction paper request ran settlement twice.");
});
if (Number((await getPredictionPaperAccount(databaseUrl, subject)).cashUsd) !== 9990)
  throw new Error("Prediction paper debit was not persisted exactly once.");
if ((await listPredictionPaperOrders(databaseUrl, subject)).length !== 1)
  throw new Error("Prediction paper order was duplicated.");
if ((await listPredictionPaperOrders(databaseUrl, otherSubject)).length)
  throw new Error("Prediction paper order leaked across accounts.");
if (
  !(await listAccountEvents(databaseUrl, subject)).some(
    (event) => event.source === "prediction_paper_orders",
  )
)
  throw new Error("Prediction paper fill did not reach account activity.");

const api = await buildApi(
  readConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    SISERA_ALLOW_DEV_AUTH: "true",
    DATABASE_URL: databaseUrl,
  }),
  {
    predictionPaperQuote: async () => ({
      priceUsd: "0.500000",
      closesAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  },
);
try {
  const liveOrderId = crypto.randomUUID();
  await connection`
    INSERT INTO market_live_orders
      (id, tenant_id, subject, venue, symbol, side, quantity, client_order_id, status)
    VALUES (${liveOrderId}, 'migration-test', ${subject}, 'binance', 'BTCUSDT', 'buy',
            1, ${liveOrderId}, 'unknown')
  `;
  const alert = (await listAccountAlerts(databaseUrl, subject)).find(
    (item) => item.sourceId === liveOrderId,
  );
  if (!alert || alert.status !== "unknown")
    throw new Error("Uncertain order did not produce a server-owned alert.");
  if ((await listAccountAlerts(databaseUrl, otherSubject)).length)
    throw new Error("Account alerts leaked across subjects.");
  const alertHeaders = {
    "x-sisera-dev-role": "trader",
    "x-sisera-dev-subject": subject,
  };
  const alertResponse = await api.inject({
    method: "GET",
    url: "/v1/alerts",
    headers: alertHeaders,
  });
  if (
    alertResponse.statusCode !== 200 ||
    !alertResponse.json().data.some((item) => item.id === alert.id)
  )
    throw new Error("Account alert API did not return the uncertain order.");
  const acknowledgement = await api.inject({
    method: "POST",
    url: `/v1/alerts/${alert.id}/acknowledge`,
    headers: alertHeaders,
  });
  if (acknowledgement.statusCode !== 200)
    throw new Error("Account acknowledgement could not be saved.");
  if (
    !(await listAccountAlerts(databaseUrl, subject)).find((item) => item.id === alert.id)
      ?.acknowledgedAt
  )
    throw new Error("Account acknowledgement did not persist.");
  const foreignAcknowledgement = await api.inject({
    method: "POST",
    url: `/v1/alerts/${alert.id}/acknowledge`,
    headers: { ...alertHeaders, "x-sisera-dev-subject": otherSubject },
  });
  if (foreignAcknowledgement.statusCode !== 404)
    throw new Error("Another account could acknowledge an alert.");
  await saveAccountPreferences(databaseUrl, subject, {
    refreshIntervalMs: 60000,
    failedOrderAlerts: false,
    leaderboardOptIn: undefined,
  });
  if ((await listAccountAlerts(databaseUrl, subject)).some((item) => item.id === alert.id))
    throw new Error("Disabled order alerts were still returned.");
  await saveAccountPreferences(databaseUrl, subject, {
    refreshIntervalMs: 60000,
    failedOrderAlerts: true,
    leaderboardOptIn: undefined,
  });
  const delayedRequestId = `0x${suffix.padEnd(64, "2")}`;
  await createBridgeTransfer(databaseUrl, {
    requestId: delayedRequestId,
    tenantId: "migration-test",
    subject,
    originAddress: "0x1111111111111111111111111111111111111111",
    recipient: "0x2222222222222222222222222222222222222222",
    originChainId: 8453,
    destinationChainId: 999,
    originAmountUsdc: "5",
    quotedOutputUsdc: "4.9",
  });
  await markBridgeSourceSubmitted(databaseUrl, subject, delayedRequestId, sourceTxHash);
  await connection`
    UPDATE bridge_transfers SET source_submitted_at = now() - interval '16 minutes'
    WHERE request_id = ${delayedRequestId}
  `;
  await updateBridgeTransferStatus(
    databaseUrl,
    subject,
    delayedRequestId,
    "source_submitted",
    sourceTxHash,
    null,
  );
  const delayed = (await listAccountAlerts(databaseUrl, subject)).find(
    (item) => item.source === "bridge_transfers" && item.detail.requestId === delayedRequestId,
  );
  if (!delayed || delayed.status !== "delayed")
    throw new Error("A delayed bridge did not produce an account alert.");
  await updateBridgeTransferStatus(
    databaseUrl,
    subject,
    delayedRequestId,
    "success",
    sourceTxHash,
    null,
  );
  if ((await listAccountAlerts(databaseUrl, subject)).some((item) => item.id === delayed.id))
    throw new Error("A completed bridge still has an active delay alert.");
  const apiOrder = {
    id: crypto.randomUUID(),
    marketId: "MARKET-456",
    outcome: "no",
    depositUsd: "5",
  };
  const request = {
    method: "POST",
    url: "/v1/prediction-orders/paper",
    headers: {
      "x-sisera-dev-role": "trader",
      "x-sisera-dev-subject": subject,
      "content-type": "application/json",
    },
    payload: apiOrder,
  };
  const first = await api.inject(request);
  const retry = await api.inject(request);
  if (first.statusCode !== 200 || retry.statusCode !== 200)
    throw new Error("Prediction paper API could not settle and retry an order.");
  if (Number((await getPredictionPaperAccount(databaseUrl, subject)).cashUsd) !== 9985)
    throw new Error("Prediction paper API retried a debit.");
} finally {
  await api.close();
  await connection.end();
}

console.log("Account persistence and ownership boundaries verified.");
