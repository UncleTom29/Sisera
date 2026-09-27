import { readdirSync } from "node:fs";
import postgres from "postgres";

const files = readdirSync("packages/db/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
const connection = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
try {
  const applied = await connection`SELECT name FROM _sisera_migrations ORDER BY name`;
  if (JSON.stringify(applied.map((row) => row.name)) !== JSON.stringify(files))
    throw new Error("Database migration level does not match the repository.");
  const [tables] = await connection`
    SELECT
      to_regclass('public.agent_manifests') IS NOT NULL AS agents,
      to_regclass('public.market_paper_orders') IS NOT NULL AS orders,
      to_regclass('public.account_preferences') IS NOT NULL AS preferences,
      to_regclass('public.alert_acknowledgements') IS NOT NULL AS alerts,
      to_regclass('public.account_events') IS NOT NULL AS events,
      to_regclass('public.bridge_transfers') IS NOT NULL AS bridges,
      to_regclass('public.prediction_paper_accounts') IS NOT NULL AS prediction_accounts,
      to_regclass('public.prediction_paper_orders') IS NOT NULL AS prediction_orders
  `;
  if (
    !tables?.agents ||
    !tables?.orders ||
    !tables?.preferences ||
    !tables?.alerts ||
    !tables?.events ||
    !tables?.bridges ||
    !tables?.prediction_accounts ||
    !tables?.prediction_orders
  )
    throw new Error("Required account tables are missing after migration.");
  await connection`
    INSERT INTO account_preferences (subject) VALUES ('migration-private')
  `;
  const [privatePreference] = await connection`
    SELECT leaderboard_opt_in AS "leaderboardOptIn"
    FROM account_preferences WHERE subject = 'migration-private'
  `;
  if (privatePreference?.leaderboardOptIn !== false)
    throw new Error("Leaderboard participation must default to off.");
  const bridgeRequestId = `0x${"a".repeat(64)}`;
  await connection`
    INSERT INTO bridge_transfers
      (request_id, tenant_id, subject, origin_address, recipient, origin_chain_id,
       destination_chain_id, origin_amount_usdc, quoted_output_usdc)
    VALUES (${bridgeRequestId}, 'migration-test', 'migration-test',
            '0x1111111111111111111111111111111111111111',
            '0x2222222222222222222222222222222222222222', 8453, 999, 10, 9.9)
  `;
  await connection`
    UPDATE bridge_transfers SET status = 'source_submitted'
    WHERE request_id = ${bridgeRequestId}
  `;
  const bridgeEvents = await connection`
    SELECT status FROM account_events
    WHERE source = 'bridge_transfers' AND subject = 'migration-test'
  `;
  if (
    bridgeEvents.length !== 2 ||
    !bridgeEvents.some((row) => row.status === "quoted") ||
    !bridgeEvents.some((row) => row.status === "source_submitted")
  )
    throw new Error("Bridge state changes were not recorded in the account timeline.");
  const id = crypto.randomUUID();
  await connection`
    INSERT INTO market_live_orders
      (id, tenant_id, subject, venue, symbol, side, quantity, client_order_id, status)
    VALUES (${id}, 'migration-test', 'migration-test', 'binance', 'BTCUSDT', 'buy', 1, ${id}, 'submitting')
  `;
  await connection`UPDATE market_live_orders SET status = 'unknown' WHERE id = ${id}`;
  await connection`UPDATE market_live_orders SET status = 'submitting' WHERE id = ${id}`;
  await connection`UPDATE market_live_orders SET status = 'unknown' WHERE id = ${id}`;
  const events = await connection`
    SELECT status FROM account_events WHERE source = 'market_live_orders' AND source_id = ${id}::uuid
  `;
  if (
    events.length !== 4 ||
    events.filter((row) => row.status === "submitting").length !== 2 ||
    events.filter((row) => row.status === "unknown").length !== 2
  )
    throw new Error("Order state transitions were not recorded in the event ledger.");
  const predictionId = crypto.randomUUID();
  await connection`
    INSERT INTO prediction_paper_accounts (subject) VALUES ('migration-prediction')
  `;
  const [predictionAccount] = await connection`
    SELECT cash_usd::text AS cash, positions FROM prediction_paper_accounts
    WHERE subject = 'migration-prediction'
  `;
  if (Number(predictionAccount?.cash) !== 10000 || Object.keys(predictionAccount.positions).length)
    throw new Error("Prediction paper account has an invalid initial balance.");
  await connection`
    INSERT INTO prediction_paper_orders
      (id, tenant_id, subject, market_id, outcome, deposit_usd, fill_price_usd,
       contracts, fee_usd, closes_at)
    VALUES (${predictionId}, 'migration-test', 'migration-prediction', 'MARKET-123',
            'yes', 10, 0.4, 24.875, 0.05, now() + interval '1 day')
  `;
  const [predictionEvent] = await connection`
    SELECT mode, status FROM account_events
    WHERE source = 'prediction_paper_orders' AND source_id = ${predictionId}::uuid
  `;
  if (predictionEvent?.mode !== "paper" || predictionEvent.status !== "filled")
    throw new Error("Prediction paper order was not recorded in the account timeline.");
  try {
    await connection`UPDATE account_events SET status = 'tampered' WHERE source_id = ${id}::uuid`;
    throw new Error("The account event ledger allowed an update.");
  } catch (error) {
    if (error?.code !== "P0001") throw error;
  }
  console.log("Fresh PostgreSQL schema verified.");
} finally {
  await connection.end();
}
