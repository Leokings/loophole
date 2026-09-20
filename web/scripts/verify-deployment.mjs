#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  asRecord,
  assertChain,
  clientFor,
  endpointFor,
  expectedMethods,
  readSource,
  requireStage,
  verifySourceAndSchema,
} from "./deployment-shared.mjs";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function address(value, label) {
  const result = String(value || "").trim();
  if (!ADDRESS_PATTERN.test(result)) throw new Error(`${label} is not a GenLayer address`);
  return result;
}

function sameAddress(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Usage: npm run verify:deployment -- ../deployments/<artifact>.json");
  const artifactPath = resolve(process.cwd(), input);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const stage = requireStage(artifact.stage);
  if (artifact.chainId !== stage.chainId || artifact.network !== stage.network) {
    throw new Error("Deployment artifact network metadata is inconsistent");
  }
  const endpoint = endpointFor(stage, artifact.rpcUrl);
  const client = clientFor(stage, undefined, endpoint);
  await assertChain(client, stage);

  const republicAddress = address(artifact?.republic?.address, "republic.address");
  const courtAddress = address(artifact?.court?.address, "court.address");
  const [republicSource, courtSource] = await Promise.all([
    readSource("contracts/AutonomousRepublic.py"),
    readSource("contracts/RepublicCourt.py"),
  ]);
  const [republic, court, gameValue, courtValue] = await Promise.all([
    verifySourceAndSchema(client, republicAddress, republicSource, expectedMethods.republic, "AutonomousRepublic"),
    verifySourceAndSchema(client, courtAddress, courtSource, expectedMethods.court, "RepublicCourt"),
    client.readContract({ address: republicAddress, functionName: "get_game", jsonSafeReturn: true }),
    client.readContract({ address: courtAddress, functionName: "get_court", jsonSafeReturn: true }),
  ]);
  const game = asRecord(gameValue, "get_game");
  const courtState = asRecord(courtValue, "get_court");
  if (!sameAddress(address(game.court_address, "get_game.court_address"), courtAddress)) {
    throw new Error("AutonomousRepublic court link does not match the artifact");
  }
  if (!sameAddress(address(courtState.republic_address, "get_court.republic_address"), republicAddress)) {
    throw new Error("RepublicCourt republic link does not match the artifact");
  }

  console.log(JSON.stringify({
    ok: true,
    artifactPath,
    chainId: stage.chainId,
    court: { address: courtAddress, sourceSha256: court.sourceSha256 },
    network: stage.network,
    republic: { address: republicAddress, round: game.round_number, sourceSha256: republic.sourceSha256 },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
