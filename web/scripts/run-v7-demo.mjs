#!/usr/bin/env node

/**
 * Resumable, data-driven V7 live-demo runner. This file is intentionally not
 * run as part of local verification: it writes to StudioNet.
 *
 * A reviewer-approved scenario plan contains the exact method calls/read-backs
 * for the live world's current state. Keys live only in the ignored wallet file.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";
import { assertTimingWindows, releaseTimings } from "./v7-release-guards.mjs";
import { clientFor, endpointFor, requireStage } from "./deployment-shared.mjs";

const root = resolve(process.cwd(), "..");
const evidenceDir = resolve(root, ".live-evidence");
const walletPath = resolve(evidenceDir, "v7-demo-wallets.json");
const statePath = resolve(root, "deploy/demo-state.json");
const planPath = resolve(root, process.argv[2] || "deploy/v7-demo-plan.json");
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

async function save(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

async function load(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function loadWallets() {
  const stored = await load(walletPath, null);
  if (stored) return stored;
  const wallets = Object.fromEntries(["A", "B", "C", "D"].map((seat) => {
    const privateKey = generatePrivateKey();
    return [seat, { address: createAccount(privateKey).address, privateKey }];
  }));
  await save(walletPath, wallets);
  return wallets;
}

function assertPlan(plan, contracts) {
  if (!Array.isArray(plan.steps) || plan.steps.length < 1) throw new Error("Demo plan must contain ordered steps.");
  const ids = new Set();
  for (const step of plan.steps) {
    if (!step.id || ids.has(step.id)) throw new Error("Each demo step needs a unique id.");
    ids.add(step.id);
    if (!step.title || !step.method || !Array.isArray(step.args) || !Array.isArray(step.readbacks)) {
      throw new Error(`Demo step ${step.id} must define title, method, args, and readbacks.`);
    }
    if (!contracts[step.contract]) throw new Error(`Demo step ${step.id} names an unknown contract.`);
    if (!step.wallet || !["A", "B", "C", "D"].includes(step.wallet)) throw new Error(`Demo step ${step.id} needs a wallet A–D.`);
    if (step.expected_failure && !step.expected_error_code) throw new Error(`Expected failure ${step.id} must name its error code.`);
    if (!step.expected_failure && step.expected_error_code) throw new Error(`Unexpected error expectation on ${step.id}.`);
  }
  const claims = plan.steps.filter((step) => step.method === "claim_faction");
  if (claims.length !== 4 || new Set(claims.map((step) => step.wallet)).size !== 4
      || new Set(claims.map((step) => String(step.args[0]))).size !== 4) {
    throw new Error("The plan must claim four distinct faction seats with four distinct throwaway wallets.");
  }
  const fallbackIndex = plan.steps.findIndex((step) => step.method === "advance_round_fallback");
  if (fallbackIndex !== plan.steps.length - 1) {
    throw new Error("The expected fallback advance must be the final demo step.");
  }
}

function includesExpectedValue(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function finalizedResult(client, txHash) {
  const receipt = await client.waitForTransactionReceipt({
    fullTransaction: true,
    hash: txHash,
    interval: 10_000,
    retries: 1_080,
    status: TransactionStatus.FINALIZED,
  });
  if (receipt.statusName !== TransactionStatus.FINALIZED) throw new Error(`Transaction did not reach finality (${receipt.statusName ?? "unknown"}).`);
  const leaderReceipts = receipt.consensus_data?.leader_receipt ?? [];
  const leader = leaderReceipts.find((entry) => entry.mode === "leader") ?? leaderReceipts[0];
  const consensus = receipt.resultName ?? transactionResultNumberToName[String(receipt.result)] ?? "UNKNOWN";
  const execution = leader?.execution_result ?? receipt.txExecutionResultName ?? "UNKNOWN";
  const errors = JSON.stringify(leaderReceipts);
  return { consensus, execution, errors, receipt };
}

async function executeStep(step, state, clients, accounts, contracts, plan) {
  const previous = state.steps[step.id];
  const record = previous ?? {
    id: step.id, title: step.title, method: step.method, contract: step.contract,
    args: step.args, expected_failure: Boolean(step.expected_failure),
    expected_error_code: step.expected_error_code ?? null,
    status: "NOT_SUBMITTED", votes: null, readback: null,
  };
  if (!record.tx_hash) {
    const hash = await clients[step.wallet].writeContract({
      account: accounts[step.wallet], address: contracts[step.contract], args: step.args,
      functionName: step.method, value: 0n,
    });
    record.tx_hash = String(hash);
    record.status = "SUBMITTED";
    state.steps[step.id] = record;
    await save(statePath, state); // Persist the hash before finality polling.
  }

  let result;
  try { result = await finalizedResult(clients[step.wallet], record.tx_hash); }
  catch (error) {
    record.status = "PENDING_OR_UNAVAILABLE";
    state.steps[step.id] = record;
    await save(statePath, state);
    throw new Error(`Step ${step.id} remains resumable at ${record.tx_hash}; receipt not final: ${error.message}`);
  }
  record.execution_result = result.execution;
  record.consensus_result = result.consensus;
  record.votes = result.receipt.consensus_data?.votes ?? null;
  const accepted = ["AGREE", "MAJORITY_AGREE"].includes(result.consensus)
    && ["SUCCESS", "FINISHED_WITH_RETURN"].includes(result.execution);
  if (step.expected_failure) {
    const failed = !accepted && result.errors.includes(step.expected_error_code);
    record.status = failed ? "FINALIZED_EXPECTED_FAILURE" : "FINALIZED_UNEXPECTED_RESULT";
    if (!failed) {
      state.steps[step.id] = record;
      await save(statePath, state);
      throw new Error(`Step ${step.id} did not produce expected failure ${step.expected_error_code}; recorded and stopped.`);
    }
  } else {
    record.status = accepted ? "FINALIZED_SUCCESS" : "FINALIZED_UNEXPECTED_RESULT";
    if (!accepted) {
      state.steps[step.id] = record;
      await save(statePath, state);
      throw new Error(`Step ${step.id} finalized unexpectedly; recorded and stopped.`);
    }
  }

  for (const readback of step.readbacks) {
    const client = clients[step.wallet];
    const actual = await client.readContract({
      address: contracts[readback.contract], args: readback.args,
      functionName: readback.method, jsonSafeReturn: true,
    });
    if (readback.expected !== undefined && !includesExpectedValue(actual, readback.expected)) {
      record.readback = { [readback.id]: actual };
      state.steps[step.id] = record;
      await save(statePath, state);
      throw new Error(`Step ${step.id} read-back ${readback.id} did not match its expected value; recorded and stopped.`);
    }
    record.readback = { ...record.readback, [readback.id]: actual };
  }
  state.steps[step.id] = record;
  await save(statePath, state);
  if (plan.pause_after?.includes(step.id)) throw new Error(`Plan requested a safe checkpoint after ${step.id}.`);
  return record;
}

async function main() {
  if (process.argv[3] !== "--confirm-live-studionet") {
    throw new Error("This writes live StudioNet state. Re-run with <plan.json> --confirm-live-studionet only after owner approval.");
  }
  const timing = releaseTimings();
  assertTimingWindows(timing);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const artifactPath = resolve(root, plan.deployment_artifact);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  if (artifact.network !== "studionet" || Number(artifact.chain_id) !== 61999) throw new Error("Demo deployment artifact must identify StudioNet chain 61999.");
  const contracts = Object.fromEntries(Object.entries(artifact.contracts ?? {}).map(([name, entry]) => [name, entry.address]));
  for (const name of ["republic", "caseLaw", "court"]) {
    if (!addressPattern.test(contracts[name] ?? "")) throw new Error(`Deployment artifact is missing ${name}.`);
  }
  assertPlan(plan, contracts);
  const wallets = await loadWallets();
  const accounts = Object.fromEntries(Object.entries(wallets).map(([seat, wallet]) => [seat, createAccount(wallet.privateKey)]));
  const stage = requireStage("studionet");
  const endpoint = endpointFor(stage);
  const clients = Object.fromEntries(Object.entries(accounts).map(([seat, account]) => [seat, clientFor(stage, account, endpoint)]));
  if (await clients.A.getChainId() !== stage.chainId) throw new Error("RPC chain mismatch; no demo transactions sent.");
  const state = await load(statePath, { version: 1, network: "studionet", deployment_artifact: plan.deployment_artifact,
    plan_path: planPath, steps: {} });
  if (state.network !== "studionet" || state.deployment_artifact !== plan.deployment_artifact) throw new Error("Saved demo state belongs to another release.");
  for (const step of plan.steps) await executeStep(step, state, clients, accounts, contracts, plan);
  state.completed_at = new Date().toISOString();
  state.timing = timing;
  await save(statePath, state);
  console.log(`Recorded ${Object.keys(state.steps).length} finalized demo steps; wallet keys remain in the ignored evidence directory.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "V7 demo stopped safely."); process.exitCode = 1; });
