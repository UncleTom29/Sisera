import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const mode = process.argv[2] ?? "all";
const supportedModes = new Set(["all", "web", "api"]);

if (!supportedModes.has(mode)) {
  console.error(`Unsupported local service mode: ${mode}`);
  process.exit(1);
}

const environmentFile = resolve(process.cwd(), ".env");
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const environment = {
  ...process.env,
  API_PORT: process.env.API_PORT ?? "4000",
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  SISERA_ALLOW_DEV_AUTH: process.env.SISERA_ALLOW_DEV_AUTH ?? "true",
  SISERA_LOCAL_OPERATOR_MODE: process.env.SISERA_LOCAL_OPERATOR_MODE ?? "true",
};

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const argumentsByMode = {
  all: ["exec", "turbo", "run", "dev", "--cache-dir=.turbo/cache", "--env-mode=loose"],
  web: ["--filter", "@sisera/web", "dev"],
  api: ["--filter", "@sisera/api", "dev"],
};

console.log(
  `[sisera] Starting ${mode} in local operator mode. Production authentication remains unchanged.`,
);

const child = spawn(command, argumentsByMode[mode], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`[sisera] Failed to start local services: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
