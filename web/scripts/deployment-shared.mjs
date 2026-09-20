import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import {
  ExecutionResult,
  TransactionStatus,
  transactionResultNumberToName,
} from "genlayer-js/types";

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const projectRoot = resolve(webRoot, "..");

export const stages = {
  studionet: {
    artifactName: "studionet",
    chain: studionet,
    chainId: 61999,
    hostname: "studio.genlayer.com",
    network: "studionet",
    rpcUrl: "https://studio.genlayer.com/api",
  },
  bradbury: {
    artifactName: "bradbury",
    chain: testnetBradbury,
    chainId: 4221,
    hostname: "rpc-bradbury.genlayer.com",
    network: "testnetBradbury",
    rpcUrl: "https://rpc-bradbury.genlayer.com",
  },
};

export const expectedMethods = {
  court: [
    "appeal_case",
    "file_case",
    "finalize_case",
    "get_case",
    "get_court",
    "get_precedent",
    "resolve_appeal",
    "resolve_case",
    "submit_appeal_response",
    "submit_brief",
  ],
  republic: [
    "advance_round",
    "apply_court_ruling",
    "claim_faction",
    "commit_action",
    "commit_objective",
    "finalize_season",
    "get_court_ruling",
    "get_crisis",
    "get_faction",
    "get_factions_json",
    "get_game",
    "get_law",
    "get_objective",
    "get_office",
    "get_offices_json",
    "get_round_action",
    "get_round_summary",
    "get_season_summary",
    "preview_action_commitment",
    "preview_objective_commitment",
    "release_faction",
    "reveal_action",
    "reveal_objective",
    "set_court_address",
    "start_next_season",
  ],
};

export function requireStage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const stage = stages[normalized];
  if (!stage) throw new Error("Deployment stage must be exactly studionet or bradbury");
  return { key: normalized, ...stage };
}

export function endpointFor(stage, override = process.env.GENLAYER_RPC_URL) {
  const rpcUrl = String(override || stage.rpcUrl).trim();
  let url;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error("GENLAYER_RPC_URL must be a valid URL");
  }
  if (url.protocol !== "https:" || url.hostname !== stage.hostname) {
    throw new Error(`GENLAYER_RPC_URL does not match the selected ${stage.key} network`);
  }
  return rpcUrl;
}

export function clientFor(stage, account, endpoint) {
  return createClient({ account, chain: stage.chain, endpoint });
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function retryPropagation(label, operation, retries = 60) {
  let latestError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      latestError = error;
      if (attempt < retries) await sleep(5_000);
    }
  }
  const detail = latestError instanceof Error ? latestError.message : String(latestError);
  throw new Error(`${label} was not visible after ${retries} attempts: ${detail}`);
}

export async function assertChain(client, stage) {
  const connectedChainId = await client.getChainId();
  if (connectedChainId !== stage.chainId) {
    throw new Error(`RPC chain ID ${connectedChainId} does not match ${stage.key} (${stage.chainId})`);
  }
}

export function assertSchema(schema, requiredMethods, label) {
  const available = new Set(Object.keys(schema?.methods || {}));
  const missing = requiredMethods.filter((method) => !available.has(method));
  if (missing.length > 0) throw new Error(`${label} schema is missing: ${missing.join(", ")}`);
}

export function assertSuccessfulReceipt(receipt, label) {
  if (receipt.statusName !== TransactionStatus.FINALIZED) {
    throw new Error(`${label} did not finalize (status: ${receipt.statusName || receipt.status})`);
  }
  const consensusData = receipt.consensus_data || receipt.consensusData;
  const leaderReceipts = consensusData?.leader_receipt || consensusData?.leaderReceipt;
  const executions = Array.isArray(leaderReceipts)
    ? leaderReceipts
    : leaderReceipts ? [leaderReceipts] : [];
  const leaderExecution = executions.find((entry) => entry?.mode === "leader") || executions[0];
  const executionResult = leaderExecution?.execution_result || leaderExecution?.executionResult;
  if (executionResult && executionResult !== "SUCCESS") {
    const genvmResult = leaderExecution?.genvm_result || leaderExecution?.genvmResult;
    const description = genvmResult?.error_description || genvmResult?.errorDescription;
    throw new Error(`${label} execution failed (${description || executionResult})`);
  }
  if (
    receipt.txExecutionResultName !== undefined
    && receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN
  ) {
    throw new Error(`${label} execution failed (${receipt.txExecutionResultName || "unknown result"})`);
  }
  if (receipt.txExecutionResultName === undefined) {
    const consensusResult = transactionResultNumberToName[String(receipt.result)];
    if (consensusResult !== "AGREE" && consensusResult !== "MAJORITY_AGREE") {
      throw new Error(`${label} consensus failed (${consensusResult || receipt.result || "unknown result"})`);
    }
  }
}

export async function waitForFinalized(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({
    fullTransaction: true,
    hash,
    interval: 5_000,
    retries: 720,
    status: TransactionStatus.FINALIZED,
  });
  assertSuccessfulReceipt(receipt, label);
  return receipt;
}

export function deployedAddress(receipt, label) {
  const address = receipt?.data?.contract_address
    || receipt?.data?.contractAddress
    || receipt?.txDataDecoded?.contractAddress;
  if (typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`${label} receipt did not contain a deployed contract address`);
  }
  // StudioNet currently keys contract lookups by the receipt's exact checksum casing.
  return address;
}

export async function readSource(relativePath) {
  const source = await readFile(resolve(projectRoot, relativePath), "utf8");
  const requiredHeader = '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }';
  if (source.split(/\r?\n/, 1)[0] !== requiredHeader) {
    throw new Error(`${relativePath} does not use the pinned GenLayer dependency header`);
  }
  return source;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function verifySourceAndSchema(client, address, source, requiredMethods, label) {
  const [deployedSource, schema] = await retryPropagation(
    `${label} deployment`,
    () => Promise.all([
      client.getContractCode(address),
      client.getContractSchema(address),
    ]),
  );
  if (sha256(deployedSource) !== sha256(source)) {
    throw new Error(`${label} deployed source hash does not match the repository source`);
  }
  assertSchema(schema, requiredMethods, label);
  return { schema, sourceSha256: sha256(source) };
}

export function asRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return an object`);
  }
  return value;
}
