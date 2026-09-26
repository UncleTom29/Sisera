import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import postgres from "postgres";

const envFile = existsSync(".env.production")
  ? ".env.production"
  : existsSync(".env")
    ? ".env"
    : null;

if (envFile) {
  process.loadEnvFile(envFile);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is required.");
  process.exit(1);
}

console.log("[migrate] Connecting to PostgreSQL database...");
const sql = postgres(connectionString, { max: 1 });

async function runMigrations() {
  try {
    // Create migrations tracker table
    await sql`
      CREATE TABLE IF NOT EXISTS _sisera_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const migrationsDir = resolve(process.cwd(), "packages/db/migrations");
    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const appliedRows = await sql`SELECT name FROM _sisera_migrations`;
    const applied = new Set(appliedRows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] - ${file} (already applied)`);
        continue;
      }

      console.log(`[migrate] > Applying migration ${file}...`);
      const content = readFileSync(join(migrationsDir, file), "utf-8");

      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO _sisera_migrations (name) VALUES (${file})`;
      });

      console.log(`[migrate] ✓ ${file} applied successfully.`);
    }

    console.log("[migrate] All database migrations are up to date.");
  } catch (error) {
    console.error("[migrate] Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
