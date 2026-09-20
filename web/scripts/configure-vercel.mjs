#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAccount } from "genlayer-js";

import { readSource, requireStage, sha256, webRoot } from "./deployment-shared.mjs";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const HASH_PATTERN = /^[a-fA-F0-9]{64}$/;
const TEAM = "leokings588-5902s-projects";
const TARGETS = ["preview", "production"];

function requiredString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function address(value, label) {
  const result = requiredString(value, label);
  if (!ADDRESS_PATTERN.test(result)) throw new Error(`${label} is not a GenLayer address`);
  return result;
}

function sameAddress(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function validateArtifact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Deployment artifact must be a JSON object");
  }
  const stage = requireStage(value.stage);
  if (
    value.schemaVersion !== 1 ||
    value.chainId !== stage.chainId ||
    value.network !== stage.network ||
    value.rpcUrl !== stage.rpcUrl
  ) {
    throw new Error("Deployment artifact network metadata is inconsistent");
  }
  if (
    value.frontendEnvironment?.NEXT_PUBLIC_GENLAYER_NETWORK !== stage.network ||
    value.frontendEnvironment?.NEXT_PUBLIC_GENLAYER_RPC_URL !== stage.rpcUrl
  ) {
    throw new Error(`Artifact frontend network configuration does not match ${stage.key}`);
  }
  for (const [label, hash] of [
    ["republic source hash", value.republic?.sourceSha256],
    ["court source hash", value.court?.sourceSha256],
    ["repository source hash", value.repositorySourceSha256],
  ]) {
    if (!HASH_PATTERN.test(String(hash ?? ""))) throw new Error(`Artifact ${label} is invalid`);
  }

  const republicAddress = address(value.republic?.address, "Artifact republic address");
  const courtAddress = address(value.court?.address, "Artifact court address");
  if (
    !sameAddress(address(value.frontendEnvironment?.NEXT_PUBLIC_REPUBLIC_ADDRESS, "Frontend republic address"), republicAddress) ||
    !sameAddress(address(value.frontendEnvironment?.NEXT_PUBLIC_COURT_ADDRESS, "Frontend court address"), courtAddress) ||
    !sameAddress(address(value.keeperEnvironment?.LOOPHOLE_REPUBLIC_ADDRESSES, "Keeper republic address"), republicAddress) ||
    !sameAddress(address(value.keeperEnvironment?.LOOPHOLE_COURT_ADDRESSES, "Keeper court address"), courtAddress)
  ) {
    throw new Error("Artifact environment addresses do not match its deployed contracts");
  }
  return { courtAddress, republicAddress, stage };
}

function runVercel(args, input, secretValue) {
  const executable = process.platform === "win32" ? "vercel.cmd" : "vercel";
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : executable;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", executable, ...args]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: webRoot,
    encoding: "utf8",
    input,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const raw = `${result.stdout || ""}\n${result.stderr || ""}`;
    const safe = secretValue ? raw.replaceAll(secretValue, "[REDACTED]") : raw;
    throw new Error(`Vercel environment update failed: ${result.error?.message || safe.trim()}`);
  }
}

async function main() {
  const artifactArgument = requiredString(process.argv[2], "Path to a deployment artifact");
  const artifactPath = resolve(webRoot, artifactArgument);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const { courtAddress, republicAddress, stage } = validateArtifact(artifact);
  const [republicSource, courtSource] = await Promise.all([
    readSource("contracts/AutonomousRepublic.py"),
    readSource("contracts/RepublicCourt.py"),
  ]);
  if (
    artifact.republic.sourceSha256 !== sha256(republicSource) ||
    artifact.court.sourceSha256 !== sha256(courtSource) ||
    artifact.repositorySourceSha256 !== sha256(republicSource + courtSource)
  ) {
    throw new Error("Deployment artifact source hashes do not match this repository checkout");
  }

  const keeperPrivateKey = requiredString(
    process.env.GENLAYER_KEEPER_PRIVATE_KEY,
    "GENLAYER_KEEPER_PRIVATE_KEY",
  );
  if (!PRIVATE_KEY_PATTERN.test(keeperPrivateKey)) {
    throw new Error("GENLAYER_KEEPER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  const keeperAddress = address(process.env.GENLAYER_KEEPER_ADDRESS, "GENLAYER_KEEPER_ADDRESS");
  if (!sameAddress(createAccount(keeperPrivateKey).address, keeperAddress)) {
    throw new Error("GENLAYER_KEEPER_ADDRESS does not match GENLAYER_KEEPER_PRIVATE_KEY");
  }
  const cronSecret = requiredString(process.env.CRON_SECRET, "CRON_SECRET");
  if (cronSecret.length < 32) throw new Error("CRON_SECRET must contain at least 32 characters");
  const maxContracts = Number(process.env.LOOPHOLE_KEEPER_MAX_CONTRACTS || 20);
  if (!Number.isSafeInteger(maxContracts) || maxContracts < 1 || maxContracts > 100) {
    throw new Error("LOOPHOLE_KEEPER_MAX_CONTRACTS must be an integer from 1 through 100");
  }

  const variables = [
    ["NEXT_PUBLIC_GENLAYER_NETWORK", stage.network, false],
    ["NEXT_PUBLIC_GENLAYER_RPC_URL", stage.rpcUrl, false],
    ["NEXT_PUBLIC_REPUBLIC_ADDRESS", republicAddress, false],
    ["NEXT_PUBLIC_COURT_ADDRESS", courtAddress, false],
    ["GENLAYER_KEEPER_ADDRESS", keeperAddress, false],
    ["LOOPHOLE_REPUBLIC_ADDRESSES", republicAddress, false],
    ["LOOPHOLE_COURT_ADDRESSES", courtAddress, false],
    ["LOOPHOLE_KEEPER_MAX_CONTRACTS", String(maxContracts), false],
    ["CRON_SECRET", cronSecret, true],
    ["GENLAYER_KEEPER_PRIVATE_KEY", keeperPrivateKey, true],
  ];

  if (process.argv.includes("--validate-only")) {
    console.log(`Validated ${variables.length} hosting variables without sending them.`);
    return;
  }

  for (const target of TARGETS) {
    for (const [name, value, sensitive] of variables) {
      const args = ["env", "add", name, target, "--force", "--yes", "--scope", TEAM];
      if (sensitive) args.push("--sensitive");
      runVercel(args, value, sensitive ? value : undefined);
      console.log(`Configured ${name} for ${target}.`);
    }
  }
  console.log("Vercel hosting configuration is synchronized; no deployer credential was uploaded.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
