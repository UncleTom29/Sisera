import {
  createBridgeTransfer,
  getAccountPreferences,
  getBridgeTransfer,
  listAccountEvents,
  listBridgeTransfers,
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

console.log("Account persistence and ownership boundaries verified.");
