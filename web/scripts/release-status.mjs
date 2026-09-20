#!/usr/bin/env node

import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function requiredAddress(name) {
  const value = String(process.env[name] || "").trim();
  if (!ADDRESS_PATTERN.test(value)) throw new Error(`${name} is missing or invalid`);
  return value;
}

function formatGen(value) {
  const whole = value / 1_000_000_000_000_000_000n;
  const fractional = String(value % 1_000_000_000_000_000_000n).padStart(18, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : String(whole);
}

async function main() {
  const deployer = requiredAddress("GENLAYER_DEPLOYER_ADDRESS");
  const keeper = requiredAddress("GENLAYER_KEEPER_ADDRESS");
  const network = String(process.env.NEXT_PUBLIC_GENLAYER_NETWORK || "studionet").trim();
  if (network !== "studionet" && network !== "testnetBradbury") {
    throw new Error("NEXT_PUBLIC_GENLAYER_NETWORK must be studionet or testnetBradbury");
  }
  const studio = network === "studionet";
  const client = createClient({ chain: studio ? studionet : testnetBradbury });
  const chainId = await client.getChainId();
  const expectedChainId = studio ? 61999 : 4221;
  if (chainId !== expectedChainId) throw new Error(`${network} RPC returned chain ID ${chainId}`);
  const republic = String(process.env.NEXT_PUBLIC_REPUBLIC_ADDRESS || "").trim();
  const court = String(process.env.NEXT_PUBLIC_COURT_ADDRESS || "").trim();
  if (studio) {
    console.log(JSON.stringify({
      chainId,
      contractsConfigured: ADDRESS_PATTERN.test(republic) && ADDRESS_PATTERN.test(court),
      deployer: { address: deployer },
      gasModel: "gasless",
      keeper: { address: keeper },
      network,
      readyToDeploy: true,
      readyToKeep: true,
    }, null, 2));
    return;
  }
  const [deployerBalance, keeperBalance] = await Promise.all([
    client.getBalance({ address: deployer }),
    client.getBalance({ address: keeper }),
  ]);
  console.log(JSON.stringify({
    chainId,
    contractsConfigured: ADDRESS_PATTERN.test(republic) && ADDRESS_PATTERN.test(court),
    deployer: { address: deployer, balanceGEN: formatGen(deployerBalance) },
    gasModel: "funded",
    keeper: { address: keeper, balanceGEN: formatGen(keeperBalance) },
    network,
    readyToDeploy: deployerBalance > 0n,
    readyToKeep: keeperBalance > 0n,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
