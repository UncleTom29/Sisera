import { buildApi } from "../apps/api/dist/app.js";
import { readConfig } from "../apps/api/dist/config.js";
import {
  applyPredictionPaperOrder,
  createBridgeTransfer,
  getAccountPreferences,
  getBridgeTransfer,
  getPredictionPaperAccount,
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
}

console.log("Account persistence and ownership boundaries verified.");
