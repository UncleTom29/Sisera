import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const generatedTypes = fileURLToPath(new URL("../.next/types", import.meta.url));
const executableSuffix = process.platform === "win32" ? ".cmd" : "";

rmSync(generatedTypes, { force: true, recursive: true });

for (const [command, args] of [
  [`next${executableSuffix}`, ["typegen"]],
  [`tsc${executableSuffix}`, ["--noEmit"]],
]) {
  const result = spawnSync(command, args, {
    cwd: webRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
