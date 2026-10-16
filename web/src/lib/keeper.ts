import { isInKeeperWindow, nextKeeperSlotAt, republicSlotSeconds } from "./heartbeat";

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const STORAGE_BUDGET_PATTERN = /daily snapshot storage budget/i;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const DEFAULT_MAX_CONTRACTS = 20;
const HARD_MAX_CONTRACTS = 100;

export type KeeperConfig = {
  courtAddresses: string[];
  expectedAddress?: string;
  maxContracts: number;
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
  readCourt(address: string): Promise<Record<string, unknown>>;
  readOpenCaseIds(address: string, limit: number): Promise<unknown[]>;
  readRepublic(address: string): Promise<Record<string, unknown>>;
  writeCourt(address: string, method: string, args: unknown[]): Promise<string>;
  writeRepublic(address: string, method: string): Promise<string>;
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

function scalar(value: unknown) {
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "string") {
    return Number(value);
  }
  return 0;
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

  const republicWindowOpen = isInKeeperWindow(now, config.republicSlotSeconds);
  for (const address of config.republicAddresses) {
    if (!republicWindowOpen) {
      skipped += 1;
      results.push({
        address,
        kind: "republic",
        nextSlotAt: nextKeeperSlotAt(now, config.republicSlotSeconds),
        status: "paced",
      });
      continue;
    }
    try {
      const game = await adapter.readRepublic(address);
      const phase = String(game.phase ?? "UNKNOWN");
      const method = phase === "READY_TO_ADVANCE"
        ? "advance_round"
        : phase === "READY_TO_FINALIZE_SEASON"
          ? "finalize_season"
          : phase === "SEASON_FINAL"
            ? "start_next_season"
            : "";
      if (!method) {
        skipped += 1;
        results.push({ address, kind: "republic", phase, status: "skipped" });
        continue;
      }
      const transactionHash = validHash(await adapter.writeRepublic(address, method));
      submitted += 1;
      results.push({ address, kind: "republic", method, phase, status: "submitted", transactionHash });
    } catch (cause) {
      recordError({ address, kind: "republic" }, cause);
    }
  }

  for (const address of config.courtAddresses) {
    try {
      const court = await adapter.readCourt(address);
      const openCaseCount = scalar(court.open_case_count);
      const scanLimit = Math.min(openCaseCount, config.maxContracts);
      const openCaseIds = scanLimit > 0
        ? (await adapter.readOpenCaseIds(address, scanLimit))
          .map(scalar)
          .filter((caseId) => Number.isSafeInteger(caseId) && caseId > 0)
        : [];
      let actionable = 0;
      for (const caseId of openCaseIds) {
        const item = await adapter.readCase(address, caseId);
        const status = String(item.status ?? "");
        let method = "";
        if (status === "BRIEFING" && now >= scalar(item.brief_deadline)) method = "resolve_case";
        if (status === "APPEAL_WINDOW" && now >= scalar(item.appeal_deadline)) method = "finalize_case";
        if (status === "APPEALED" && now >= scalar(item.appeal_response_deadline)) method = "resolve_appeal";
        if (!method) continue;
        const transactionHash = validHash(await adapter.writeCourt(address, method, [caseId]));
        actionable += 1;
        submitted += 1;
        results.push({ address, caseId, kind: "court", method, status: "submitted", transactionHash });
      }
      if (actionable === 0) {
        skipped += 1;
        results.push({ address, kind: "court", status: "skipped" });
      }
    } catch (cause) {
      recordError({ address, kind: "court" }, cause);
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
