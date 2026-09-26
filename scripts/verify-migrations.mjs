import { readdirSync } from "node:fs";
import postgres from "postgres";

const files = readdirSync("packages/db/migrations").filter((name) => name.endsWith(".sql")).sort();
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
      to_regclass('public.alert_acknowledgements') IS NOT NULL AS alerts
  `;
  if (!tables?.agents || !tables?.orders || !tables?.preferences || !tables?.alerts)
    throw new Error("Required account tables are missing after migration.");
  console.log("Fresh PostgreSQL schema verified.");
} finally {
  await connection.end();
}
