#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const schedulerRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

function main() {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (secret.length < 32) throw new Error("CRON_SECRET must contain at least 32 characters");
  if (process.argv.includes("--validate-only")) {
    console.log("Cloudflare secret input validated without sending it.");
    return;
  }

  const executable = process.platform === "win32"
    ? resolve(schedulerRoot, "node_modules", ".bin", "wrangler.cmd")
    : resolve(schedulerRoot, "node_modules", ".bin", "wrangler");
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : executable;
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", executable, "secret", "put", "CRON_SECRET", "--config", "wrangler.jsonc"]
    : ["secret", "put", "CRON_SECRET", "--config", "wrangler.jsonc"];
  const result = spawnSync(command, args, {
    cwd: schedulerRoot,
    encoding: "utf8",
    input: secret,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.replaceAll(secret, "[REDACTED]");
    throw new Error(`Cloudflare secret update failed: ${result.error?.message || output.trim()}`);
  }
  console.log("Cloudflare CRON_SECRET synchronized without printing its value.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
