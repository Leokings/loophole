#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionHashVariant } from "genlayer-js/types";

import {
  clientFor,
  endpointFor,
  requireStage,
  waitForFinalized,
} from "./deployment-shared.mjs";

const REPUBLIC = "0x6ECdc692BE72c75a3CD15197c32D61dbd61660D8";
const FACTION = "REFORMERS";
const ACTION = "BUILD_INFLUENCE";
const RATIONALE = "Reviewer wallet builds civic influence through a finalized signed StudioNet action.";
const evidenceDir = resolve(process.cwd(), "..", ".live-evidence");
const privatePath = resolve(evidenceDir, "loophole-reviewer-wallet-private.json");
const publicPath = resolve(evidenceDir, "loophole-reviewer-wallet-public.json");

async function save(path, value) {
  await mkdir(evidenceDir, { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function loadState() {
  try {
    return JSON.parse(await readFile(privatePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const privateKey = generatePrivateKey();
    const account = createAccount(privateKey);
    const state = { address: account.address.toLowerCase(), privateKey, transactions: {} };
    await save(privatePath, state);
    return state;
  }
}

function factionById(raw, factionId) {
  const factions = JSON.parse(String(raw));
  const faction = factions.find((entry) => entry.faction_id === factionId);
  if (!faction) throw new Error(`Faction ${factionId} was not returned by the contract`);
  return faction;
}

async function finalizedWrite(state, client, label, functionName, args = []) {
  const hash = String(await client.writeContract({
    address: REPUBLIC,
    args,
    functionName,
    value: 0n,
  }));
  state.transactions[label] = { functionName, hash, status: "SUBMITTED" };
  await save(privatePath, state);
  try {
    await waitForFinalized(client, hash, label);
    state.transactions[label].status = "FINALIZED";
    await save(privatePath, state);
  } catch (error) {
    state.transactions[label].status = "FAILED";
    state.transactions[label].result = error instanceof Error ? error.message : String(error);
    await save(privatePath, state);
    throw error;
  }
  return hash;
}

async function reconcileSubmittedTransactions(state, client) {
  let changed = false;
  for (const transaction of Object.values(state.transactions)) {
    if (transaction.status !== "SUBMITTED") continue;
    const receipt = await client.getTransaction({ hash: transaction.hash });
    if (receipt.statusName !== "FINALIZED") continue;
    const result = receipt.result_name || receipt.resultName || String(receipt.result || "UNKNOWN");
    transaction.status = ["AGREE", "MAJORITY_AGREE"].includes(result) ? "FINALIZED" : "FAILED";
    transaction.result = result;
    changed = true;
  }
  if (changed) await save(privatePath, state);
}

async function main() {
  const command = String(process.argv[2] || "state").toLowerCase();
  if (!new Set(["state", "claim", "advance", "commit", "reveal", "release"]).has(command)) {
    throw new Error("Usage: node scripts/reviewer-wallet-smoke.mjs state|claim|advance|commit|reveal|release");
  }

  const stage = { key: "studionet", ...requireStage("studionet") };
  const endpoint = endpointFor(stage);
  const state = await loadState();
  const account = createAccount(state.privateKey);
  const client = clientFor(stage, account, endpoint);
  const read = (functionName, args = []) => client.readContract({
    address: REPUBLIC,
    args,
    functionName,
    jsonSafeReturn: true,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });

  await reconcileSubmittedTransactions(state, client);

  let game = await read("get_game");
  let factionsRaw = await read("get_factions_json");
  let faction = factionById(factionsRaw, FACTION);

  if (command === "claim") {
    if (faction.controller.toLowerCase() === "0x0000000000000000000000000000000000000000") {
      await finalizedWrite(state, client, `round-${game.round_number}-claim`, "claim_faction", [FACTION]);
    } else if (faction.controller.toLowerCase() !== state.address) {
      throw new Error(`${FACTION} is controlled by another wallet`);
    }
  }

  if (command === "advance") {
    if (game.phase !== "READY_TO_ADVANCE") {
      throw new Error(`Round advance is unavailable in phase ${game.phase}`);
    }
    const prefix = `round-${game.round_number}-advance-`;
    const attempt = Object.keys(state.transactions).filter((label) => label.startsWith(prefix)).length + 1;
    await finalizedWrite(state, client, `${prefix}${attempt}`, "advance_round");
  }

  if (command === "commit") {
    if (game.phase !== "COMMIT") throw new Error(`Commit is unavailable in phase ${game.phase}`);
    if (faction.controller.toLowerCase() !== state.address) throw new Error("The reviewer wallet must claim REFORMERS first");
    const nonce = generatePrivateKey().slice(2, 50);
    const values = [FACTION, ACTION, "", 0, "", "", RATIONALE, nonce];
    const commitment = String(await read("preview_action_commitment", values));
    state.action = { action: ACTION, commitment, nonce, rationale: RATIONALE, round: game.round_number };
    await save(privatePath, state);
    await finalizedWrite(state, client, `round-${game.round_number}-commit`, "commit_action", [FACTION, commitment]);
  }

  if (command === "reveal") {
    if (game.phase !== "REVEAL") throw new Error(`Reveal is unavailable in phase ${game.phase}`);
    if (!state.action || Number(state.action.round) !== Number(game.round_number)) {
      throw new Error(`No saved reviewer action exists for round ${game.round_number}`);
    }
    await finalizedWrite(state, client, `round-${game.round_number}-reveal`, "reveal_action", [
      FACTION,
      state.action.action,
      "",
      0,
      "",
      "",
      state.action.rationale,
      state.action.nonce,
    ]);
  }

  if (command === "release") {
    if (faction.controller.toLowerCase() === state.address) {
      await finalizedWrite(state, client, `round-${game.round_number}-release`, "release_faction", [FACTION]);
    } else if (faction.controller.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
      throw new Error(`${FACTION} is controlled by another wallet`);
    }
  }

  game = await read("get_game");
  factionsRaw = await read("get_factions_json");
  faction = factionById(factionsRaw, FACTION);
  let actionReadback = null;
  if (state.action) {
    try {
      actionReadback = await read("get_round_action", [state.action.round, FACTION]);
    } catch {
      actionReadback = null;
    }
  }
  const publicEvidence = {
    action: actionReadback,
    contract: REPUBLIC,
    faction: {
      controller: faction.controller,
      controller_mode: faction.controller_mode,
      faction_id: FACTION,
      last_action_round: faction.last_action_round,
      last_action_type: faction.last_action_type,
    },
    network: "GenLayer StudioNet",
    phase: game.phase,
    round: game.round_number,
    transactions: Object.values(state.transactions).filter((transaction) => transaction.status === "FINALIZED"),
    wallet: state.address,
  };
  await save(publicPath, publicEvidence);
  console.log(JSON.stringify(publicEvidence, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
