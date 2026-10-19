#!/usr/bin/env node

/** Assemble the public proof manifest from finalized deployment/demo records. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const deploymentPath = resolve(root, process.argv[2] || "deployments/studionet-latest.json");
const demoPath = resolve(root, "deploy/demo-state.json");
const outPath = resolve(root, "deploy/proof.json");
const publicPath = resolve(root, "web/public/proof.json");

async function main() {
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  const demo = JSON.parse(await readFile(demoPath, "utf8"));
  const cases = {};
  const holdings = [];
  const demoSteps = Object.values(demo.steps ?? {});
  if (!demoSteps.length) throw new Error("Demo state contains no scenario transactions.");
  for (const record of demoSteps) {
    if (!record?.tx_hash) throw new Error(`Demo step ${record?.id || "unknown"} has no recorded transaction.`);
    if (!String(record.status || "").startsWith("FINALIZED_")) throw new Error(`Demo step ${record.id} is not finalized.`);
    const caseId = record.case_id ?? (record.case_name ? demo.case_ids?.[record.case_name] : undefined);
    if (caseId !== undefined && record.case_link_role) {
      const id = String(caseId);
      cases[id] ??= {};
      const role = record.case_link_role === "filing" || record.case_link_role === "filing_tx"
        ? "filing_tx" : record.case_link_role === "ruling" || record.case_link_role === "ruling_tx" ? "ruling_tx" : null;
      if (!role) throw new Error(`Unknown case-link role on ${record.id}.`);
      cases[id][role] = record.tx_hash;
    }
    if (record.holding_key) holdings.push({ key: record.holding_key, case_id: Number(record.holding_case_id ?? caseId) });
  }
  const proof = {
    version: 1,
    network: deployment.network,
    chain_id: deployment.chain_id,
    commit: deployment.commit,
    contracts: deployment.contracts,
    runner: deployment.runner,
    toolchain: deployment.toolchain,
    constructor_args: deployment.constructor_args,
    steps: [
      ...Object.entries(deployment.contracts ?? {}).map(([name, contract]) => ({
        id: `deploy-${name}`, title: `Deploy ${name}`, method: "deploy", contract: name,
        args: [], tx_hash: contract.deploy_tx, status: "FINALIZED_SUCCESS",
        execution_result: "SUCCESS", consensus_result: "AGREE", expected_failure: false,
      })),
      ...Object.entries(deployment.transactions ?? {}).filter(([, tx]) => tx.method).map(([id, tx]) => ({
        id, title: tx.method, method: tx.method, contract: Object.entries(deployment.contracts ?? {}).find(([, item]) => item.address === tx.contract)?.[0]
          ?? (tx.contract === deployment.runner?.probe_address ? "probe" : "unknown"),
        args: tx.args ?? [], tx_hash: tx.tx_hash, status: tx.status,
        execution_result: tx.execution_result, consensus_result: tx.consensus_result,
        expected_failure: false, readback: tx.readback ?? null,
      })),
    ],
    observed: demoSteps,
    cases,
    holdings: [...new Map(holdings.map((holding) => [holding.key, holding])).values()],
    generated_at: new Date().toISOString(),
  };
  const data = `${JSON.stringify(proof, null, 2)}\n`;
  await mkdir(resolve(root, "deploy"), { recursive: true });
  await mkdir(resolve(root, "web/public"), { recursive: true });
  await writeFile(outPath, data, { flag: "wx" });
  await writeFile(publicPath, data, { flag: "wx" });
  console.log("Wrote deploy/proof.json and byte-identical web/public/proof.json.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Proof assembly failed."); process.exitCode = 1; });
