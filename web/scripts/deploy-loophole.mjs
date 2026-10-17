#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { createAccount } from "genlayer-js";
import { CalldataAddress } from "genlayer-js/types";
import {
  assertSchema, assertSuccessfulReceipt, clientFor, deployedAddress, endpointFor,
  projectRoot, requireStage, sha256,
} from "./deployment-shared.mjs";
import { releaseTimings } from "./v7-release-guards.mjs";

const execFile = promisify(execFileCallback);
const statePath = resolve(projectRoot, ".live-evidence/v7-deployment-state.json");
const EXPECTED = {
  republic: ["open_crisis", "judge_crisis_response", "close_crisis", "get_game", "get_public_snapshot", "get_keeper_status", "get_storage_stats", "certify_law", "get_factions_json", "get_faction", "get_controlled_faction", "is_active_faction_controller", "preview_action_commitment", "get_round_action", "get_round_summary", "get_law", "get_office", "get_offices_json", "get_objective", "get_crisis", "get_season_summary", "preview_objective_commitment", "commit_objective", "reveal_objective", "finalize_season", "get_case_outcome", "is_court_action_sanctioned", "set_links", "apply_case_outcome", "claim_faction", "release_faction", "recover_abandoned_faction", "commit_action", "reveal_action", "advance_round_fallback", "advance_round"],
  caseLaw: ["set_court", "record_holding", "get_holding", "get_holding_for_case", "get_holdings_for_laws", "get_registry_summary"],
  court: ["file_case", "file_case_from_republic", "submit_brief", "resolve_case", "expire_case", "resolve_stayed_case", "recover_case_effects", "get_keeper_status", "get_case", "get_docket", "get_open_case_ids", "get_court", "get_storage_stats"],
  probe: ["write_probe", "read_probe"],
};
const contractSources = {
  republic: "contracts/AutonomousRepublic.py",
  caseLaw: "contracts/CaseLaw.py",
  court: "contracts/RepublicCourt.py",
  probe: "contracts/probe/Probe.py",
};

function addressArgument(value) {
  const pairs = String(value).slice(2).match(/.{2}/g);
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(value)) || !pairs) throw new Error("Invalid contract address in saved deployment state");
  return new CalldataAddress(Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16)));
}

async function assertReleaseBranch() {
  const { stdout: branch } = await execFile("git", ["branch", "--show-current"], { cwd: projectRoot });
  if (branch.trim() !== "v7") throw new Error("Release build requires the v7 branch.");
  const { stdout: dirty } = await execFile("git", ["status", "--porcelain"], { cwd: projectRoot });
  if (dirty.trim()) throw new Error("Release deployment requires a clean working tree.");
  const { stdout: remotes } = await execFile("git", ["branch", "-r", "--contains", "HEAD"], { cwd: projectRoot });
  if (!remotes.trim()) throw new Error("Push v7 before any live deployment; HEAD is not on a remote branch.");
}

async function loadState(commit) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.commit !== commit) throw new Error("Saved release state belongs to a different commit; archive it before starting a new release.");
    return state;
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
    return { commit, created_at: new Date().toISOString(), transactions: {}, contracts: {} };
  }
}

async function saveState(state) {
  await mkdir(resolve(projectRoot, ".live-evidence"), { recursive: true });
  const temporary = `${statePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, statePath);
}

async function waitForFinalized(client, txHash, label) {
  const receipt = await client.waitForTransactionReceipt({ fullTransaction: true, hash: txHash,
    interval: 10_000, retries: 1_080, status: "FINALIZED" });
  assertSuccessfulReceipt(receipt, label);
  return receipt;
}

async function transaction(state, id, submit, client, label, deployedName) {
  const record = state.transactions[id] ?? { status: "NOT_SUBMITTED" };
  if (!record.tx_hash) {
    const txHash = String(await submit());
    state.transactions[id] = { ...record, tx_hash: txHash, status: "SUBMITTED" };
    await saveState(state); // Persist before waiting for finality.
  }
  const receipt = await waitForFinalized(client, state.transactions[id].tx_hash, label);
  state.transactions[id].status = "FINALIZED_SUCCESS";
  state.transactions[id].execution_result = "SUCCESS";
  state.transactions[id].consensus_result = "AGREE";
  if (deployedName) {
    const address = state.contracts[deployedName]?.address || deployedAddress(receipt, label);
    state.contracts[deployedName] = { ...state.contracts[deployedName], address };
  }
  await saveState(state);
  return receipt;
}

async function main() {
  if (process.argv[2] !== "studionet") throw new Error("Usage: npm run deploy:studionet (StudioNet only)");
  await assertReleaseBranch();
  const timing = releaseTimings();
  const stage = requireStage("studionet");
  const endpoint = endpointFor(stage);
  const privateKey = String(process.env.GENLAYER_DEPLOYER_PRIVATE_KEY || "");
  if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("Set a dedicated GENLAYER_DEPLOYER_PRIVATE_KEY in web/.env.local.");
  const account = createAccount(privateKey);
  if (process.env.GENLAYER_KEEPER_PRIVATE_KEY && process.env.GENLAYER_KEEPER_PRIVATE_KEY === privateKey) {
    throw new Error("The deployer key must be separate from the keeper key.");
  }
  const { stdout: commit } = await execFile("git", ["rev-parse", "HEAD"], { cwd: projectRoot });
  const state = await loadState(commit.trim());
  const sources = Object.fromEntries(await Promise.all(Object.entries(contractSources).map(async ([name, path]) => {
    const bytes = await readFile(resolve(projectRoot, path));
    if (bytes.includes(13)) throw new Error(`${path} contains CR bytes; normalize line endings before release.`);
    return [name, bytes.toString("utf8")];
  })));
  const factions = JSON.parse(await readFile(resolve(projectRoot, "examples/factions.json"), "utf8"));
  if (!Array.isArray(factions) || factions.length < 3 || factions.length > 8) throw new Error("Faction configuration must contain 3–8 factions.");
  const republicId = String(process.env.LOOPHOLE_REPUBLIC_ID || "FIRST-REPUBLIC");
  const client = clientFor(stage, account, endpoint);
  if (await client.getChainId() !== stage.chainId) throw new Error("The RPC chain does not match StudioNet.");
  for (const [name, source] of Object.entries(sources)) {
    assertSchema(await client.getContractSchemaForCode(source), EXPECTED[name], `${name} schema preflight`);
  }

  await transaction(state, "probe.deploy", () => client.deployContract({ account, args: [], code: sources.probe }), client, "runner probe", "probe");
  const probeAddress = state.contracts.probe.address;
  if (!probeAddress) throw new Error("Runner probe deployment receipt omitted its contract address.");
  const deployedProbeSource = await client.getContractCode(probeAddress);
  if (deployedProbeSource !== sources.probe) throw new Error("Runner probe source differs byte-for-byte from this commit.");
  const beforeProbe = await client.readContract({ address: probeAddress, functionName: "read_probe", jsonSafeReturn: true });
  if (beforeProbe !== "") throw new Error("Probe started with unexpected state.");
  if (!state.transactions["probe.write"]?.tx_hash) {
    await transaction(state, "probe.write", () => client.writeContract({ account, address: probeAddress,
      args: ["loophole-v7-probe"], functionName: "write_probe", value: 0n }), client, "runner probe write");
  } else {
    await transaction(state, "probe.write", () => state.transactions["probe.write"].tx_hash, client, "runner probe write");
  }
  if (await client.readContract({ address: probeAddress, functionName: "read_probe", jsonSafeReturn: true }) !== "loophole-v7-probe") {
    throw new Error("Runner probe readback did not match the finalized write.");
  }

  await transaction(state, "republic.deploy", () => client.deployContract({ account, code: sources.republic,
    args: [republicId, JSON.stringify(factions), timing.commitSeconds, timing.revealSeconds, timing.seasonRounds,
      timing.fallbackGraceSeconds, timing.judgmentWindowSeconds] }), client, "AutonomousRepublic", "republic");
  const republic = state.contracts.republic.address;
  await transaction(state, "caselaw.deploy", () => client.deployContract({ account, code: sources.caseLaw, args: [] }), client, "CaseLaw", "caseLaw");
  const caseLaw = state.contracts.caseLaw.address;
  await transaction(state, "court.deploy", () => client.deployContract({ account, code: sources.court,
    args: [addressArgument(republic), addressArgument(caseLaw), timing.briefSeconds, timing.courtResolutionSeconds] }), client, "RepublicCourt", "court");
  const court = state.contracts.court.address;
  await transaction(state, "caselaw.set_court", () => client.writeContract({ account, address: caseLaw,
    args: [addressArgument(court)], functionName: "set_court", value: 0n }), client, "CaseLaw court link");
  await transaction(state, "republic.set_links", () => client.writeContract({ account, address: republic,
    args: [addressArgument(court), addressArgument(caseLaw)], functionName: "set_links", value: 0n }), client, "Republic links");

  const deployed = await Promise.all(Object.entries({ republic, caseLaw, court }).map(async ([name, address]) => {
    const sourceKey = name === "caseLaw" ? "caseLaw" : name;
    const transactionKey = name === "caseLaw" ? "caselaw.deploy" : `${name}.deploy`;
    const actual = await client.getContractCode(address);
    if (actual !== sources[sourceKey]) throw new Error(`${name} deployed source differs byte-for-byte from this commit.`);
    assertSchema(await client.getContractSchema(address), EXPECTED[sourceKey], `${name} deployed schema`);
    return [name, { address, source_sha256: sha256(actual), deploy_tx: state.transactions[transactionKey]?.tx_hash }];
  }));
  const proofTransactions = {
    "probe.deploy": { ...state.transactions["probe.deploy"], contract: probeAddress, method: "deploy", args: [] },
    "probe.write": { ...state.transactions["probe.write"], contract: probeAddress, method: "write_probe", args: ["loophole-v7-probe"] },
    "caseLaw.set_court": { ...state.transactions["caselaw.set_court"], contract: caseLaw, method: "set_court", args: [court] },
    "republic.set_links": { ...state.transactions["republic.set_links"], contract: republic, method: "set_links", args: [court, caseLaw] },
  };
  const record = { version: 1, network: "studionet", chain_id: stage.chainId, commit: commit.trim(), rpc_url: endpoint,
    contracts: Object.fromEntries(deployed), runner: { probe_address: probeAddress, probe_source_sha256: sha256(deployedProbeSource),
      probe_deploy_tx: state.transactions["probe.deploy"].tx_hash, probe_write_tx: state.transactions["probe.write"].tx_hash, hash: null },
    toolchain: { genlayer_js: "1.1.8", node: process.version }, constructor_args: { republic_id: republicId, faction_ids: factions.map((item) => item.id), ...timing },
    transactions: { ...state.transactions, ...proofTransactions }, generated_at: new Date().toISOString() };
  const outDir = resolve(projectRoot, "deployments"); await mkdir(outDir, { recursive: true });
  const out = resolve(outDir, `studionet-${record.generated_at.replaceAll(":", "-")}.json`);
  await writeFile(out, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  console.log(`Verified release record written to ${out}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Release failed."); process.exitCode = 1; });
