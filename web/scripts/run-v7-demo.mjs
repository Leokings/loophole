#!/usr/bin/env node

/**
 * Resumable V7 live-demo runner. The story itself lives in
 * `v7-demo-scenario.mjs`; this file owns RPC clients, durable transaction
 * recording, and the explicit StudioNet safety gate.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";
import { assertTimingWindows, releaseTimings } from "./v7-release-guards.mjs";
import { clientFor, endpointFor, requireStage } from "./deployment-shared.mjs";
import { runScenario } from "./v7-demo-scenario.mjs";

const root = resolve(process.cwd(), "..");
const evidenceDir = resolve(root, ".live-evidence");
const walletPath = resolve(evidenceDir, "v7-demo-wallets.json");
const statePath = resolve(root, "deploy/demo-state.json");
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export async function save(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, (key, item) => key === "_state_path" ? undefined : item, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function load(path, fallback) {
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

function leaderReceipt(receipt) {
  const receipts = receipt?.consensus_data?.leader_receipt ?? receipt?.consensusData?.leaderReceipt ?? [];
  const entries = Array.isArray(receipts) ? receipts : [receipts];
  return { entries, leader: entries.find((entry) => entry?.mode === "leader") ?? entries[0] };
}

function resultNames(receipt, leader) {
  const consensus = receipt.resultName
    ?? receipt.result_name
    ?? transactionResultNumberToName[String(receipt.result)]
    ?? "UNKNOWN";
  const execution = leader?.execution_result
    ?? leader?.executionResult
    ?? receipt.txExecutionResultName
    ?? receipt.tx_execution_result_name
    ?? "UNKNOWN";
  return { consensus, execution };
}

function receiptErrors(entries) { return JSON.stringify(entries); }

export async function finalizedResult(client, txHash) {
  const receipt = await client.waitForTransactionReceipt({
    fullTransaction: true, hash: txHash, interval: 10_000, retries: 1_080,
    status: TransactionStatus.FINALIZED,
  });
  if (receipt.statusName !== TransactionStatus.FINALIZED) throw new Error(`Transaction did not reach finality (${receipt.statusName ?? "unknown"}).`);
  const { entries, leader } = leaderReceipt(receipt);
  const { consensus, execution } = resultNames(receipt, leader);
  return { consensus, execution, errors: receiptErrors(entries), receipt };
}

async function acceptedResult(client, txHash) {
  const receipt = await client.waitForTransactionReceipt({
    fullTransaction: true, hash: txHash, interval: 10_000, retries: 120,
    status: TransactionStatus.ACCEPTED,
  });
  if (receipt.statusName !== TransactionStatus.ACCEPTED) throw new Error(`Transaction did not reach acceptance (${receipt.statusName ?? "unknown"}).`);
  const { entries, leader } = leaderReceipt(receipt);
  const { consensus, execution } = resultNames(receipt, leader);
  if (execution !== "SUCCESS" && execution !== "FINISHED_WITH_RETURN") throw new Error(`Accepted transaction has leader execution ${execution}.`);
  return { consensus, execution, errors: receiptErrors(entries), receipt };
}

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function isAccepted(result) {
  return ["AGREE", "MAJORITY_AGREE"].includes(result.consensus)
    && ["SUCCESS", "FINISHED_WITH_RETURN"].includes(result.execution);
}

function initialRecord(step) {
  return {
    id: step.id, title: step.title, method: step.method, contract: step.contract,
    wallet: step.wallet, args: step.args, expected_failure: Boolean(step.expected_failure),
    expected_error_code: step.expected_error_code ?? null, status: "NOT_SUBMITTED",
    votes: null, readback: null,
    ...(step.case_name ? { case_name: step.case_name } : {}),
    ...(step.case_link_role ? { case_link_role: step.case_link_role } : {}),
  };
}

/**
 * Record one transaction. Commit/reveal calls use `acceptedOnly`: the next
 * call may proceed after ACCEPTED + leader SUCCESS, while the finality sweep
 * at the end upgrades every record to FINALIZED.
 */
export async function executeStep(step, state, clients, accounts, contracts, options = {}) {
  const previous = state.steps[step.id];
  const record = previous ?? initialRecord(step);
  record.wallet = record.wallet || step.wallet;
  record.contract = record.contract || step.contract;
  record.method = record.method || step.method;
  record.args = record.args || step.args;
  if (record.status?.startsWith("FINALIZED_")) return record;
  if (!record.tx_hash) {
    const hash = await clients[step.wallet].writeContract({
      account: accounts[step.wallet], address: contracts[step.contract], args: step.args,
      functionName: step.method, value: 0n,
    });
    record.tx_hash = String(hash); record.status = "SUBMITTED";
    state.steps[step.id] = record;
    await save(state._state_path, state); // Persist the hash before polling.
  }

  let result;
  try {
    result = options.acceptedOnly
      ? await acceptedResult(clients[step.wallet], record.tx_hash)
      : await finalizedResult(clients[step.wallet], record.tx_hash);
  } catch (error) {
    record.status = options.acceptedOnly ? "ACCEPTANCE_UNCERTAIN" : "PENDING_OR_UNAVAILABLE";
    state.steps[step.id] = record;
    await save(state._state_path, state);
    throw new Error(`Step ${step.id} remains resumable at ${record.tx_hash}; receipt not ready: ${error.message}`);
  }

  record.execution_result = result.execution;
  record.consensus_result = result.consensus;
  record.votes = result.receipt.consensus_data?.votes ?? result.receipt.consensusData?.votes ?? null;
  record.error_codes = result.errors;
  if (options.acceptedOnly) {
    record.status = "ACCEPTED_PENDING_FINALITY";
    state.steps[step.id] = record;
    await save(state._state_path, state);
    return record;
  }

  const accepted = isAccepted(result);
  if (step.expected_failure) {
    const failed = !accepted && result.errors.includes(step.expected_error_code);
    record.status = failed ? "FINALIZED_EXPECTED_FAILURE" : "FINALIZED_UNEXPECTED_RESULT";
    if (!failed) {
      state.steps[step.id] = record; await save(state._state_path, state);
      throw new Error(`Step ${step.id} did not produce expected failure ${step.expected_error_code}; recorded and stopped.`);
    }
  } else {
    record.status = accepted ? "FINALIZED_SUCCESS" : "FINALIZED_UNEXPECTED_RESULT";
    if (!accepted) {
      state.steps[step.id] = record; await save(state._state_path, state);
      throw new Error(`Step ${step.id} finalized unexpectedly; recorded and stopped.`);
    }
  }
  for (const readback of step.readbacks || []) {
    const actual = await clients[step.wallet].readContract({
      address: contracts[readback.contract], args: readback.args,
      functionName: readback.method, jsonSafeReturn: true,
    });
    if (readback.expected !== undefined && !sameJson(actual, readback.expected)) {
      record.readback = { ...(record.readback || {}), [readback.id]: actual };
      state.steps[step.id] = record; await save(state._state_path, state);
      throw new Error(`Step ${step.id} read-back ${readback.id} did not match its expected value; recorded and stopped.`);
    }
    record.readback = { ...(record.readback || {}), [readback.id]: actual };
  }
  state.steps[step.id] = record;
  await save(state._state_path, state);
  return record;
}

export async function finalitySweep(state, clients) {
  for (const record of Object.values(state.steps || {})) {
    if (record.status !== "ACCEPTED_PENDING_FINALITY") continue;
    const result = await finalizedResult(clients[record.wallet], record.tx_hash);
    record.execution_result = result.execution;
    record.consensus_result = result.consensus;
    record.votes = result.receipt.consensus_data?.votes ?? result.receipt.consensusData?.votes ?? null;
    record.error_codes = result.errors;
    if (!isAccepted(result)) {
      record.status = "FINALIZED_UNEXPECTED_RESULT";
      await save(state._state_path, state);
      throw new Error(`Accepted step ${record.id} finalized unexpectedly; recorded and stopped.`);
    }
    record.status = "FINALIZED_SUCCESS";
    await save(state._state_path, state);
  }
}

function contractsFromArtifact(artifact) {
  const contracts = Object.fromEntries(Object.entries(artifact.contracts ?? {}).map(([name, entry]) => [name, entry.address]));
  for (const name of ["republic", "caseLaw", "court"]) {
    if (!addressPattern.test(contracts[name] ?? "")) throw new Error(`Deployment artifact is missing ${name}.`);
  }
  return contracts;
}

function contractRead(clients, contracts, { contract, method, args, wallet }) {
  return clients[wallet].readContract({ address: contracts[contract], args, functionName: method, jsonSafeReturn: true });
}

async function main() {
  if (process.argv[3] !== "--confirm-live-studionet") {
    throw new Error("This writes live StudioNet state. Re-run with <deployment-artifact.json> --confirm-live-studionet only after owner approval.");
  }
  const timing = releaseTimings(); assertTimingWindows(timing);
  const artifactRef = process.argv[2] || "deployments/studionet-latest.json";
  const artifact = JSON.parse(await readFile(resolve(root, artifactRef), "utf8"));
  if (artifact.network !== "studionet" || Number(artifact.chain_id ?? artifact.chainId) !== 61999) throw new Error("Demo deployment artifact must identify StudioNet chain 61999.");
  const contracts = contractsFromArtifact(artifact);
  const wallets = await loadWallets();
  const accounts = Object.fromEntries(Object.entries(wallets).map(([seat, wallet]) => [seat, createAccount(wallet.privateKey)]));
  const stage = requireStage("studionet"); const endpoint = endpointFor(stage);
  const clients = Object.fromEntries(Object.entries(accounts).map(([seat, account]) => [seat, clientFor(stage, account, endpoint)]));
  if (await clients.A.getChainId() !== stage.chainId) throw new Error("RPC chain mismatch; no demo transactions sent.");
  const state = await load(statePath, { version: 2, network: "studionet", deployment_artifact: artifactRef, steps: {} });
  state._state_path = statePath;
  if (state.network !== "studionet" || state.deployment_artifact !== artifactRef) throw new Error("Saved demo state belongs to another release.");
  const context = {
    state,
    read: (request) => contractRead(clients, contracts, request),
    executeStep: (step, options) => executeStep(step, state, clients, accounts, contracts, options),
    submitAccepted: (step) => executeStep(step, state, clients, accounts, contracts, { acceptedOnly: true }),
    saveState: () => save(statePath, state),
    finalitySweep: () => finalitySweep(state, clients),
    now: () => Date.now(),
    waitUntil: async (epochMs) => { const delay = Math.max(0, Number(epochMs) - Date.now()); await new Promise((resolvePromise) => setTimeout(resolvePromise, delay)); },
  };
  await runScenario(context);
  delete state._state_path; await save(statePath, state);
  console.log(`Recorded ${Object.keys(state.steps).length} scenario transactions; all records are finalized.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "V7 demo stopped safely."); process.exitCode = 1; });
}

