#!/usr/bin/env node

/** Read-only verification for the public V7 proof manifest. */
import { createClient } from "genlayer-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertSuccessfulReceipt, endpointFor, requireStage, sha256 } from "./deployment-shared.mjs";

const root = resolve(process.cwd(), "..");
const proofPath = resolve(root, "deploy/proof.json");
const publicProofPath = resolve(root, "web/public/proof.json");
const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function sameAddress(a, b) { return String(a || "").toLowerCase() === String(b || "").toLowerCase(); }
function hasMethod(value, method) {
  if (typeof value === "string") return value === method;
  if (Array.isArray(value)) return value.some((entry) => hasMethod(entry, method));
  if (value instanceof Map) return value.has(method) || [...value.entries()].some(([key, entry]) => key === method || hasMethod(entry, method));
  if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => key === method || hasMethod(entry, method));
  return false;
}
function txConsensus(tx) {
  const votes = tx.consensus_data?.votes ?? {};
  return Object.values(votes);
}
function collectTransactions(proof) {
  const transactions = [];
  for (const contract of Object.values(proof.contracts ?? {})) {
    if (contract.deploy_tx) transactions.push({ tx_hash: contract.deploy_tx, contract: contract.address, method: "deploy" });
  }
  for (const section of [proof.steps ?? [], proof.observed ?? []]) {
    for (const step of section) if (step.tx_hash) {
      const contract = proof.contracts?.[step.contract]?.address
        ?? (step.contract === "probe" ? proof.runner?.probe_address : undefined);
      transactions.push({ ...step, contract });
    }
  }
  for (const tx of Object.values(proof.transactions ?? {})) if (tx.tx_hash) transactions.push(tx);
  const unique = new Map(transactions.map((tx) => [tx.tx_hash, tx]));
  return [...unique.values()];
}

async function main() {
  const raw = await readFile(proofPath);
  const publicRaw = await readFile(publicProofPath);
  if (!raw.equals(publicRaw)) throw new Error("deploy/proof.json and web/public/proof.json are not byte-identical.");
  const proof = JSON.parse(raw.toString("utf8"));
  if (proof.version !== 1 || proof.network !== "studionet" || Number(proof.chain_id) !== 61999) throw new Error("Proof manifest network/version metadata is invalid.");
  const stage = requireStage(proof.network);
  const endpoint = endpointFor(stage);
  const client = createClient({ chain: stage.chain, endpoint });
  if (await client.getChainId() !== Number(proof.chain_id)) throw new Error("Connected RPC chain does not match the proof manifest.");

  for (const [name, contract] of Object.entries(proof.contracts ?? {})) {
    if (!addressPattern.test(contract.address ?? "")) throw new Error(`Proof contract ${name} has an invalid address.`);
    const source = await client.getContractCode(contract.address);
    const digest = sha256(source);
    if (digest !== contract.source_sha256) throw new Error(`On-chain source digest mismatch for ${name}.`);
  }
  if (proof.runner?.probe_address && proof.runner.probe_source_sha256) {
    const source = await client.getContractCode(proof.runner.probe_address);
    if (sha256(source) !== proof.runner.probe_source_sha256) throw new Error("Runner probe source digest mismatch.");
  }

  const txs = collectTransactions(proof);
  if (!txs.length) throw new Error("Proof manifest contains no transactions.");
  for (const item of txs) {
    if (!hashPattern.test(item.tx_hash ?? "")) throw new Error(`Invalid transaction hash in proof record ${item.id || item.method || "unknown"}.`);
    const receipt = await client.getTransaction({ hash: item.tx_hash });
    if (receipt.statusName !== "FINALIZED") throw new Error(`Transaction ${item.tx_hash} is not finalized.`);
    if (item.contract && !sameAddress(receipt.to_address ?? receipt.recipient, item.contract)) throw new Error(`Transaction recipient mismatch for ${item.tx_hash}.`);
    const decoded = receipt.txDataDecoded;
    const deploy = item.method === "deploy" || decoded?.type === "deploy";
    if (item.method === "deploy" && decoded?.type !== "deploy") throw new Error(`Transaction ${item.tx_hash} is not a deployment.`);
    if (item.method !== "deploy" && decoded?.type === "deploy") throw new Error(`Transaction ${item.tx_hash} is a deployment, expected ${item.method}.`);
    if (item.method && !deploy && !hasMethod(decoded?.callData, item.method)) throw new Error(`Decoded calldata does not identify ${item.method} for ${item.tx_hash}.`);
    if (!item.expected_failure) assertSuccessfulReceipt(receipt, item.title || item.id || item.tx_hash);
    else {
      if (receipt.txExecutionResultName === "FINISHED_WITH_RETURN") throw new Error(`Expected-failure step ${item.id} executed successfully.`);
      if (item.expected_error_code) {
        const serialized = JSON.stringify(receipt.consensus_data?.leader_receipt ?? []);
        if (!serialized.includes(item.expected_error_code)) throw new Error(`Expected error ${item.expected_error_code} was not found for ${item.id}.`);
      }
    }
    const votes = txConsensus(receipt);
    if (Array.isArray(item.votes) && item.votes.length && JSON.stringify(votes) !== JSON.stringify(item.votes)) {
      throw new Error(`Recorded votes do not match chain votes for ${item.tx_hash}.`);
    }
  }

  for (const holdingLink of proof.holdings ?? []) {
    if (typeof holdingLink.key !== "string" || !Number.isInteger(Number(holdingLink.case_id))) throw new Error("Invalid CaseLaw holding reference in proof.");
    const holding = await client.readContract({ address: proof.contracts.caseLaw.address, args: [holdingLink.key], functionName: "get_holding", jsonSafeReturn: true });
    if (!holding || Object.keys(holding).length === 0 || Number(holding.case_id) !== Number(holdingLink.case_id)) throw new Error(`CaseLaw holding read-back mismatch for ${holdingLink.key}.`);
  }

  for (const [caseId, links] of Object.entries(proof.cases ?? {})) {
    const filing = (proof.steps ?? []).concat(proof.observed ?? []).find((step) => step.tx_hash === links.filing_tx);
    const ruling = (proof.steps ?? []).concat(proof.observed ?? []).find((step) => step.tx_hash === links.ruling_tx);
    if (!Number.isInteger(Number(caseId))) throw new Error(`Invalid proof case id ${caseId}.`);
    if (links.filing_tx && (!filing || !/file_case|file_suit/i.test(filing.method ?? ""))) throw new Error(`Case ${caseId} filing link is not mapped to a case filing step.`);
    const summaryAtFiling = ruling?.method === "file_case" && ruling.status === "FINALIZED_SUCCESS"
      && Object.values(ruling.readback ?? {}).some((value) => value && typeof value === "object" && value.status === "SUMMARY");
    if (links.ruling_tx && (!ruling || (!/resolve_case|summary|expire_case/i.test(ruling.method ?? "") && !summaryAtFiling))) throw new Error(`Case ${caseId} ruling link is not mapped to a case decision step.`);
    if (links.holding_key && !(proof.holdings ?? []).some((holding) => holding.key === links.holding_key)) throw new Error(`Case ${caseId} holding is not listed in proof.holdings.`);
  }

  console.log(JSON.stringify({ ok: true, chain_id: proof.chain_id, contracts: Object.keys(proof.contracts ?? {}).length,
    transactions: txs.length, case_links: Object.keys(proof.cases ?? {}).length,
    mutable_readbacks: "historical (mutable state, not re-checked)" }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Proof verification failed."); process.exitCode = 1; });
