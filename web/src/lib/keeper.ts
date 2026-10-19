import { isInKeeperWindow, nextKeeperSlotAt, republicSlotSeconds } from "./heartbeat";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const STORAGE_BUDGET_PATTERN = /daily snapshot storage budget/i;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const DEFAULT_MAX_CONTRACTS = 20;
const HARD_MAX_CONTRACTS = 100;
const DEFAULT_MAX_WRITES_PER_TICK = 3;
const HARD_MAX_WRITES_PER_TICK = 6;

export type KeeperConfig = {
  courtAddresses: string[];
  expectedAddress?: string;
  maxContracts: number;
  maxWritesPerTick: number;
  network: "studionet" | "testnetBradbury";
  privateKey: `0x${string}`;
  republicAddresses: string[];
  republicSlotSeconds: number;
  rpcUrl: string;
};

const NETWORKS = {
  studionet: {
    hostname: "studio.genlayer.com",
    rpcUrl: "https://studio.genlayer.com/api",
  },
  testnetBradbury: {
    hostname: "rpc-bradbury.genlayer.com",
    rpcUrl: "https://rpc-bradbury.genlayer.com",
  },
} as const;

export type KeeperAdapter = {
  address: string;
  readCase(address: string, caseId: number): Promise<Record<string, unknown>>;
  readKeeperStatus(address: string): Promise<Record<string, unknown>>;
  writeContract(address: string, method: string, args: unknown[]): Promise<string>;
};

function required(value: string | undefined, name: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function parseAddresses(value: string | undefined, name: string, requiredList: boolean) {
  const source = String(value ?? "").trim();
  if (!source) {
    if (requiredList) throw new Error(`${name} is required`);
    return [];
  }
  const result: string[] = [];
  for (const raw of source.split(",")) {
    const address = raw.trim();
    if (!ADDRESS_PATTERN.test(address)) throw new Error(`${name} contains an invalid address`);
    if (!result.some((existing) => existing.toLowerCase() === address.toLowerCase())) {
      result.push(address);
    }
  }
  return result;
}

function validHash(value: string) {
  if (!HASH_PATTERN.test(value)) throw new Error("GenLayer did not return a transaction hash");
  return value;
}

export function isAuthorizedCron(authorization: string | null, secret: string | undefined) {
  const expected = String(secret ?? "").trim();
  return expected.length >= 16 && authorization === `Bearer ${expected}`;
}

export function parseKeeperConfig(environment: Readonly<Record<string, string | undefined>>): KeeperConfig {
  const privateKey = required(environment.GENLAYER_KEEPER_PRIVATE_KEY, "GENLAYER_KEEPER_PRIVATE_KEY");
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error("GENLAYER_KEEPER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  const maxContracts = positiveInteger(
    environment.LOOPHOLE_KEEPER_MAX_CONTRACTS,
    DEFAULT_MAX_CONTRACTS,
    HARD_MAX_CONTRACTS,
  );
  const maxWritesPerTick = positiveInteger(
    environment.LOOPHOLE_KEEPER_MAX_WRITES_PER_TICK,
    DEFAULT_MAX_WRITES_PER_TICK,
    HARD_MAX_WRITES_PER_TICK,
  );
  const republicAddresses = parseAddresses(
    environment.LOOPHOLE_REPUBLIC_ADDRESSES || environment.NEXT_PUBLIC_REPUBLIC_ADDRESS,
    "LOOPHOLE_REPUBLIC_ADDRESSES",
    true,
  );
  const courtAddresses = parseAddresses(
    environment.LOOPHOLE_COURT_ADDRESSES || environment.NEXT_PUBLIC_COURT_ADDRESS,
    "LOOPHOLE_COURT_ADDRESSES",
    false,
  );
  if (republicAddresses.length + courtAddresses.length > maxContracts) {
    throw new Error(`Configured contracts exceed LOOPHOLE_KEEPER_MAX_CONTRACTS (${maxContracts})`);
  }
  const expectedAddress = environment.GENLAYER_KEEPER_ADDRESS?.trim().toLowerCase();
  if (expectedAddress && !ADDRESS_PATTERN.test(expectedAddress)) {
    throw new Error("GENLAYER_KEEPER_ADDRESS must be a 20-byte hex address");
  }
  const networkName = String(environment.NEXT_PUBLIC_GENLAYER_NETWORK || "testnetBradbury").trim();
  if (networkName !== "studionet" && networkName !== "testnetBradbury") {
    throw new Error("NEXT_PUBLIC_GENLAYER_NETWORK must be studionet or testnetBradbury");
  }
  const network = NETWORKS[networkName];
  const rpcUrl = String(environment.NEXT_PUBLIC_GENLAYER_RPC_URL || network.rpcUrl).trim();
  let parsedRpcUrl: URL;
  try {
    parsedRpcUrl = new URL(rpcUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_GENLAYER_RPC_URL must be a valid URL");
  }
  if (parsedRpcUrl.protocol !== "https:" || parsedRpcUrl.hostname !== network.hostname) {
    throw new Error(`NEXT_PUBLIC_GENLAYER_RPC_URL does not match ${networkName}`);
  }
  return {
    courtAddresses,
    expectedAddress,
    maxContracts,
    maxWritesPerTick,
    network: networkName,
    privateKey: privateKey as `0x${string}`,
    republicAddresses,
    republicSlotSeconds: republicSlotSeconds(networkName, environment.NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS),
    rpcUrl,
  };
}

export async function runKeeper({
  adapter,
  config,
  now = Math.floor(Date.now() / 1000),
}: {
  adapter: KeeperAdapter;
  config: KeeperConfig;
  now?: number;
}) {
  const results: Array<Record<string, unknown>> = [];
  let deferred = 0;
  let failed = 0;
  let skipped = 0;
  let submitted = 0;

  // A refused write that the network will accept again after its daily budget resets
  // is deferred work, not a keeper failure.
  function recordError(entry: Record<string, unknown>, cause: unknown) {
    const error = cause instanceof Error ? cause.message : "Unknown keeper error";
    if (STORAGE_BUDGET_PATTERN.test(error)) {
      deferred += 1;
      results.push({ ...entry, error, reason: "STUDIO_DAILY_STORAGE_BUDGET", status: "deferred" });
    } else {
      failed += 1;
      results.push({ ...entry, error, status: "failed" });
    }
  }

  const contracts = [
    ...config.republicAddresses.map((address) => ({ address, kind: "republic" as const })),
    ...config.courtAddresses.map((address) => ({ address, kind: "court" as const })),
  ];
  const writeCap = Math.min(config.maxWritesPerTick, HARD_MAX_WRITES_PER_TICK);
  for (const contract of contracts) {
    const { address, kind } = contract;
    if (kind === "republic" && !isInKeeperWindow(now, config.republicSlotSeconds)) {
      skipped += 1;
      results.push({ address, kind, nextSlotAt: nextKeeperSlotAt(now, config.republicSlotSeconds), status: "paced" });
      continue;
    }
    try {
      const keeperStatus = await adapter.readKeeperStatus(address);
      const ops = Array.isArray(keeperStatus.ops) ? keeperStatus.ops : [];
      if (ops.length === 0) {
        skipped += 1;
        results.push({ address, kind, status: "skipped" });
        continue;
      }
      let writes = 0;
      for (const rawOp of ops) {
        if (writes >= writeCap) break;
        const op = rawOp && typeof rawOp === "object" ? rawOp as Record<string, unknown> : {};
        const method = String(op.method ?? "");
        const args = Array.isArray(op.args) ? op.args : [];
        if (!method) {
          failed += 1;
          results.push({ address, kind, status: "failed", error: "Keeper status contained an invalid operation" });
          break;
        }
        try {
          const transactionHash = validHash(await adapter.writeContract(address, method, args));
          writes += 1;
          submitted += 1;
          results.push({ address, args, kind, method, status: "submitted", transactionHash });
        } catch (cause) {
          const beforeFailed = failed;
          const beforeDeferred = deferred;
          recordError({ address, args, kind, method }, cause);
          if (failed > beforeFailed || deferred > beforeDeferred) break;
        }
      }
    } catch (cause) {
      recordError({ address, kind }, cause);
    }
  }

  return {
    deferred,
    failed,
    keeperAddress: adapter.address,
    ok: failed === 0,
    processed: config.republicAddresses.length + config.courtAddresses.length,
    results,
    skipped,
    submitted,
  };
}
