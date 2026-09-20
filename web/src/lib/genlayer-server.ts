import "server-only";

import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import type { CalldataEncodable } from "genlayer-js/types";

import type { KeeperAdapter, KeeperConfig } from "@/lib/keeper";

type HexAddress = `0x${string}`;

export function createKeeperAdapter(config: KeeperConfig): KeeperAdapter {
  const account = createAccount(config.privateKey);
  if (config.expectedAddress && account.address.toLowerCase() !== config.expectedAddress) {
    throw new Error("GENLAYER_KEEPER_ADDRESS does not match GENLAYER_KEEPER_PRIVATE_KEY");
  }
  const client = createClient({
    account,
    chain: config.network === "studionet" ? studionet : testnetBradbury,
    endpoint: config.rpcUrl,
  });

  async function read(address: string, functionName: string, args: CalldataEncodable[] = []) {
    return client.readContract({
      address: address as HexAddress,
      args,
      functionName,
      jsonSafeReturn: true,
    }) as Promise<Record<string, unknown>>;
  }

  async function write(address: string, functionName: string, args: CalldataEncodable[] = []) {
    return String(await client.writeContract({
      address: address as HexAddress,
      args,
      functionName,
      value: 0n,
    }));
  }

  return {
    address: account.address.toLowerCase(),
    readCase: (address, caseId) => read(address, "get_case", [caseId]),
    readCourt: (address) => read(address, "get_court"),
    readRepublic: (address) => read(address, "get_game"),
    writeCourt: (address, method, args) => write(address, method, args as CalldataEncodable[]),
    writeRepublic: (address, method) => write(address, method),
  };
}
