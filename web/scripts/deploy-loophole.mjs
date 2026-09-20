#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createAccount, generatePrivateKey } from "genlayer-js";
import { CalldataAddress } from "genlayer-js/types";

import {
  asRecord,
  assertChain,
  assertSchema,
  clientFor,
  deployedAddress,
  endpointFor,
  expectedMethods,
  projectRoot,
  readSource,
  requireStage,
  retryPropagation,
  sha256,
  verifySourceAndSchema,
  waitForFinalized,
} from "./deployment-shared.mjs";

const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function integerSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function deploymentAddress(value, label) {
  const address = String(value || "").trim();
  if (!ADDRESS_PATTERN.test(address)) throw new Error(`${label} is not a GenLayer address`);
  return address;
}

function sameAddress(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function contractAddressArgument(value, label) {
  const address = deploymentAddress(value, label);
  const pairs = address.slice(2).match(/.{2}/g);
  if (!pairs || pairs.length !== 20) throw new Error(`${label} could not be encoded`);
  return new CalldataAddress(Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16)));
}

function resumedDeployment(addressName, transactionName, label) {
  const rawAddress = String(process.env[addressName] || "").trim();
  const transactionHash = String(process.env[transactionName] || "").trim().toLowerCase();
  if (!rawAddress && !transactionHash) return undefined;
  if (!rawAddress || !transactionHash) {
    throw new Error(`${addressName} and ${transactionName} must be set together`);
  }
  const address = deploymentAddress(rawAddress, addressName);
  if (!TRANSACTION_HASH_PATTERN.test(transactionHash)) {
    throw new Error(`${transactionName} is not a transaction hash`);
  }
  console.log(`Resuming verified ${label} deployment ${transactionHash} at ${address}.`);
  return { address, transactionHash };
}

async function verifyResumedReceipt(client, resumed, label) {
  const receipt = await waitForFinalized(client, resumed.transactionHash, `${label} deployment`);
  const receiptAddress = deployedAddress(receipt, label);
  if (!sameAddress(receiptAddress, resumed.address)) {
    throw new Error(`${label} resume address does not match its deployment receipt`);
  }
  return receipt;
}

async function main() {
  const stage = requireStage(process.argv[2] || process.env.LOOPHOLE_DEPLOY_STAGE);
  const endpoint = endpointFor(stage);
  const ephemeralStudio = process.env.LOOPHOLE_EPHEMERAL_STUDIONET === "1";
  if (ephemeralStudio && stage.key !== "studionet") {
    throw new Error("LOOPHOLE_EPHEMERAL_STUDIONET is allowed only for studionet");
  }
  if (ephemeralStudio && process.env.GENLAYER_DEPLOYER_ADDRESS) {
    throw new Error("Do not set GENLAYER_DEPLOYER_ADDRESS for an ephemeral StudioNet deployment");
  }
  const privateKey = ephemeralStudio
    ? generatePrivateKey()
    : String(process.env.GENLAYER_DEPLOYER_PRIVATE_KEY || "").trim();
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error("GENLAYER_DEPLOYER_PRIVATE_KEY must be a 32-byte hex private key");
  }

  const account = createAccount(privateKey);
  const expectedDeployer = process.env.GENLAYER_DEPLOYER_ADDRESS?.trim().toLowerCase();
  if (expectedDeployer && account.address.toLowerCase() !== expectedDeployer) {
    throw new Error("GENLAYER_DEPLOYER_ADDRESS does not match GENLAYER_DEPLOYER_PRIVATE_KEY");
  }

  const client = clientFor(stage, account, endpoint);
  await assertChain(client, stage);
  if (ephemeralStudio) {
    console.log("Using an in-memory StudioNet deployer; its private key will not be persisted.");
  }

  const [republicSource, courtSource, factionsSource] = await Promise.all([
    readSource("contracts/AutonomousRepublic.py"),
    readSource("contracts/RepublicCourt.py"),
    readFile(resolve(projectRoot, "examples/factions.json"), "utf8"),
  ]);
  const factions = JSON.parse(factionsSource);
  if (!Array.isArray(factions) || factions.length < 3 || factions.length > 8) {
    throw new Error("examples/factions.json must contain three through eight factions");
  }

  const settings = {
    appealSeconds: integerSetting("LOOPHOLE_APPEAL_SECONDS", 86_400, 60, 604_800),
    briefSeconds: integerSetting("LOOPHOLE_BRIEF_SECONDS", 86_400, 60, 604_800),
    commitSeconds: integerSetting("LOOPHOLE_COMMIT_SECONDS", 86_400, 60, 604_800),
    republicId: String(process.env.LOOPHOLE_REPUBLIC_ID || "FIRST-REPUBLIC").trim(),
    revealSeconds: integerSetting("LOOPHOLE_REVEAL_SECONDS", 86_400, 60, 604_800),
    seasonRounds: integerSetting("LOOPHOLE_SEASON_ROUNDS", 12, 8, 30),
  };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(settings.republicId)) {
    throw new Error("LOOPHOLE_REPUBLIC_ID must be a canonical identifier of at most 64 characters");
  }

  const [republicSchema, courtSchema] = await Promise.all([
    client.getContractSchemaForCode(republicSource),
    client.getContractSchemaForCode(courtSource),
  ]);
  assertSchema(republicSchema, expectedMethods.republic, "AutonomousRepublic preflight");
  assertSchema(courtSchema, expectedMethods.court, "RepublicCourt preflight");

  console.log(`Deploying Loophole to ${stage.key} (${stage.chainId}) from ${account.address}...`);
  const resumedRepublic = resumedDeployment(
    "LOOPHOLE_RESUME_REPUBLIC_ADDRESS",
    "LOOPHOLE_RESUME_REPUBLIC_TX_HASH",
    "AutonomousRepublic",
  );
  let republicTxHash;
  let republicAddress;
  if (resumedRepublic) {
    await verifyResumedReceipt(client, resumedRepublic, "AutonomousRepublic");
    republicTxHash = resumedRepublic.transactionHash;
    republicAddress = resumedRepublic.address;
  } else {
    republicTxHash = await client.deployContract({
      account,
      args: [
        settings.republicId,
        JSON.stringify(factions),
        settings.commitSeconds,
        settings.revealSeconds,
        settings.seasonRounds,
      ],
      code: republicSource,
    });
    console.log(`AutonomousRepublic submitted: ${republicTxHash}`);
    const republicReceipt = await waitForFinalized(client, republicTxHash, "AutonomousRepublic deployment");
    republicAddress = deployedAddress(republicReceipt, "AutonomousRepublic");
  }
  const republicVerification = await verifySourceAndSchema(
    client,
    republicAddress,
    republicSource,
    expectedMethods.republic,
    "AutonomousRepublic",
  );
  const initialGame = asRecord(await retryPropagation(
    "AutonomousRepublic state",
    () => client.readContract({
      address: republicAddress,
      functionName: "get_game",
      jsonSafeReturn: true,
    }),
  ), "get_game after deployment");
  if (initialGame.republic_id !== settings.republicId) {
    throw new Error("AutonomousRepublic constructor state does not match this release");
  }
  if (
    Number(initialGame.commit_seconds) !== settings.commitSeconds
    || Number(initialGame.reveal_seconds) !== settings.revealSeconds
    || Number(initialGame.season_rounds) !== settings.seasonRounds
    || !sameAddress(deploymentAddress(initialGame.owner, "get_game.owner"), account.address)
  ) {
    throw new Error("AutonomousRepublic resumed state does not match this release configuration");
  }
  console.log(`AutonomousRepublic finalized: ${republicAddress}`);

  const resumedCourt = resumedDeployment(
    "LOOPHOLE_RESUME_COURT_ADDRESS",
    "LOOPHOLE_RESUME_COURT_TX_HASH",
    "RepublicCourt",
  );
  let courtTxHash;
  let courtAddress;
  if (resumedCourt) {
    await verifyResumedReceipt(client, resumedCourt, "RepublicCourt");
    courtTxHash = resumedCourt.transactionHash;
    courtAddress = resumedCourt.address;
  } else {
    courtTxHash = await client.deployContract({
      account,
      args: [contractAddressArgument(republicAddress, "RepublicCourt republic address"), settings.briefSeconds, settings.appealSeconds],
      code: courtSource,
    });
    console.log(`RepublicCourt submitted: ${courtTxHash}`);
    const courtReceipt = await waitForFinalized(client, courtTxHash, "RepublicCourt deployment");
    courtAddress = deployedAddress(courtReceipt, "RepublicCourt");
  }
  const courtVerification = await verifySourceAndSchema(
    client,
    courtAddress,
    courtSource,
    expectedMethods.court,
    "RepublicCourt",
  );
  const initialCourt = asRecord(await retryPropagation(
    "RepublicCourt state",
    () => client.readContract({
      address: courtAddress,
      functionName: "get_court",
      jsonSafeReturn: true,
    }),
  ), "get_court after deployment");
  if (!sameAddress(deploymentAddress(initialCourt.republic_address, "get_court.republic_address"), republicAddress)) {
    throw new Error("RepublicCourt constructor state points to the wrong republic");
  }
  if (
    Number(initialCourt.brief_seconds) !== settings.briefSeconds
    || Number(initialCourt.appeal_seconds) !== settings.appealSeconds
    || !sameAddress(deploymentAddress(initialCourt.owner, "get_court.owner"), account.address)
  ) {
    throw new Error("RepublicCourt resumed state does not match this release configuration");
  }
  console.log(`RepublicCourt finalized: ${courtAddress}`);

  const gameBeforeLink = asRecord(await retryPropagation(
    "AutonomousRepublic link state",
    () => client.readContract({ address: republicAddress, functionName: "get_game", jsonSafeReturn: true }),
  ), "get_game before court link");
  const configuredCourt = deploymentAddress(gameBeforeLink.court_address, "get_game.court_address");
  let linkTxHash = null;
  if (sameAddress(configuredCourt, ZERO_ADDRESS)) {
    linkTxHash = await client.writeContract({
      account,
      address: republicAddress,
      args: [contractAddressArgument(courtAddress, "AutonomousRepublic court address")],
      functionName: "set_court_address",
      value: 0n,
    });
    console.log(`Court link submitted: ${linkTxHash}`);
    await waitForFinalized(client, linkTxHash, "Court link");
  } else if (sameAddress(configuredCourt, courtAddress)) {
    console.log("Court link is already finalized; skipping the one-time write.");
  } else {
    throw new Error(`AutonomousRepublic is already linked to a different court (${configuredCourt})`);
  }

  await retryPropagation("Court link", async () => {
    const [gameValue, courtValue] = await Promise.all([
      client.readContract({ address: republicAddress, functionName: "get_game", jsonSafeReturn: true }),
      client.readContract({ address: courtAddress, functionName: "get_court", jsonSafeReturn: true }),
    ]);
    const nextGame = asRecord(gameValue, "get_game");
    const nextCourt = asRecord(courtValue, "get_court");
    if (!sameAddress(deploymentAddress(nextGame.court_address, "get_game.court_address"), courtAddress)) {
      throw new Error("AutonomousRepublic is not linked to the deployed court");
    }
    if (!sameAddress(deploymentAddress(nextCourt.republic_address, "get_court.republic_address"), republicAddress)) {
      throw new Error("RepublicCourt points to the wrong republic");
    }
    return true;
  });

  const createdAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    createdAt,
    stage: stage.key,
    network: stage.network,
    chainId: stage.chainId,
    rpcUrl: endpoint,
    deployer: account.address.toLowerCase(),
    republic: {
      address: republicAddress,
      constructor: {
        republicId: settings.republicId,
        factionIds: factions.map((faction) => faction.id),
        commitSeconds: settings.commitSeconds,
        revealSeconds: settings.revealSeconds,
        seasonRounds: settings.seasonRounds,
      },
      sourceSha256: republicVerification.sourceSha256,
      transactionHash: republicTxHash,
    },
    court: {
      address: courtAddress,
      constructor: {
        appealSeconds: settings.appealSeconds,
        briefSeconds: settings.briefSeconds,
        republicAddress,
      },
      sourceSha256: courtVerification.sourceSha256,
      transactionHash: courtTxHash,
    },
    linkTransactionHash: linkTxHash,
    frontendEnvironment: {
      NEXT_PUBLIC_COURT_ADDRESS: courtAddress,
      NEXT_PUBLIC_GENLAYER_NETWORK: stage.network,
      NEXT_PUBLIC_GENLAYER_RPC_URL: endpoint,
      NEXT_PUBLIC_REPUBLIC_ADDRESS: republicAddress,
    },
    keeperEnvironment: {
      LOOPHOLE_COURT_ADDRESSES: courtAddress,
      LOOPHOLE_REPUBLIC_ADDRESSES: republicAddress,
    },
    repositorySourceSha256: sha256(republicSource + courtSource),
  };

  const deploymentDirectory = resolve(projectRoot, "deployments");
  await mkdir(deploymentDirectory, { recursive: true });
  const timestamp = createdAt.replaceAll(":", "-");
  const artifactPath = resolve(deploymentDirectory, `${stage.artifactName}-${timestamp}.json`);
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });

  console.log(`Deployment verified and recorded at ${artifactPath}`);
  console.log(`NEXT_PUBLIC_GENLAYER_NETWORK=${stage.network}`);
  console.log(`NEXT_PUBLIC_GENLAYER_RPC_URL=${endpoint}`);
  console.log(`NEXT_PUBLIC_REPUBLIC_ADDRESS=${republicAddress}`);
  console.log(`NEXT_PUBLIC_COURT_ADDRESS=${courtAddress}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
