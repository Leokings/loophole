import { describe, expect, it } from "vitest";

import { isAuthorizedCron, parseKeeperConfig, runKeeper, type KeeperAdapter } from "./keeper";

const REPUBLIC = "0x1111111111111111111111111111111111111111";
const COURT = "0x2222222222222222222222222222222222222222";
const KEY = `0x${"ab".repeat(32)}`;
const HASH = `0x${"cd".repeat(32)}`;
const CHECKSUMMED_REPUBLIC = "0x83AC7CCD379b054373f04709Fe56D51f9f1af0a7";

function config() {
  return parseKeeperConfig({
    GENLAYER_KEEPER_PRIVATE_KEY: KEY,
    LOOPHOLE_COURT_ADDRESSES: COURT,
    LOOPHOLE_REPUBLIC_ADDRESSES: REPUBLIC,
  });
}

function adapter(overrides: Partial<KeeperAdapter> = {}): KeeperAdapter {
  return {
    address: "0x3333333333333333333333333333333333333333",
    async readCase() { return { status: "FINAL" }; },
    async readKeeperStatus() { return { ops: [] }; },
    async writeContract() { return HASH; },
    ...overrides,
  };
}

describe("keeper security and scheduling", () => {
  it("requires an exact sufficiently long cron bearer secret", () => {
    expect(isAuthorizedCron("Bearer 1234567890abcdef", "1234567890abcdef")).toBe(true);
    expect(isAuthorizedCron("Bearer wrong", "1234567890abcdef")).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
  });

  it("normalizes configuration without exposing the private key", () => {
    const parsed = config();
    expect(parsed.republicAddresses).toEqual([REPUBLIC]);
    expect(parsed.courtAddresses).toEqual([COURT]);
    expect(parsed.network).toBe("testnetBradbury");
    expect(parsed.rpcUrl).toBe("https://rpc-bradbury.genlayer.com");
    expect(parsed.maxWritesPerTick).toBe(3);
  });

  it("selects StudioNet explicitly and rejects a mismatched RPC", () => {
    const studio = parseKeeperConfig({
      GENLAYER_KEEPER_PRIVATE_KEY: KEY,
      LOOPHOLE_REPUBLIC_ADDRESSES: REPUBLIC,
      NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
    });
    expect(studio.network).toBe("studionet");
    expect(studio.rpcUrl).toBe("https://studio.genlayer.com/api");
    expect(() => parseKeeperConfig({
      GENLAYER_KEEPER_PRIVATE_KEY: KEY,
      LOOPHOLE_REPUBLIC_ADDRESSES: REPUBLIC,
      NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
      NEXT_PUBLIC_GENLAYER_RPC_URL: "https://rpc-bradbury.genlayer.com",
    })).toThrow("does not match studionet");
  });

  it("preserves checksummed StudioNet contract addresses", () => {
    const studio = parseKeeperConfig({
      GENLAYER_KEEPER_PRIVATE_KEY: KEY,
      LOOPHOLE_REPUBLIC_ADDRESSES: `${CHECKSUMMED_REPUBLIC},${CHECKSUMMED_REPUBLIC.toLowerCase()}`,
      NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
    });
    expect(studio.republicAddresses).toEqual([CHECKSUMMED_REPUBLIC]);
  });

  it("executes keeper ops in priority order up to the per-tick cap", async () => {
    const writes: string[] = [];
    const result = await runKeeper({
      adapter: adapter({
        async readKeeperStatus() { return { ops: ["one", "two", "three", "four"].map((method) => ({ method, args: [] })) }; },
        async writeContract(_address, method) { writes.push(method); return HASH; },
      }),
      config: { ...config(), courtAddresses: [], maxWritesPerTick: 3 },
    });
    expect(writes).toEqual(["one", "two", "three"]);
    expect(result.submitted).toBe(3);
  });

  it("stops a contract at the first deferred op", async () => {
    const writes: string[] = [];
    const result = await runKeeper({
      adapter: adapter({
        async readKeeperStatus() { return { ops: ["first", "second", "third"].map((method) => ({ method, args: [] })) }; },
        async writeContract(_address, method) {
          writes.push(method);
          if (method === "second") throw new Error("Contract exceeded the daily snapshot storage budget");
          return HASH;
        },
      }),
      config: { ...config(), courtAddresses: [] },
    });
    expect(writes).toEqual(["first", "second"]);
    expect(result.deferred).toBe(1);
    expect(result.submitted).toBe(1);
  });

  it("reads keeper status once per contract", async () => {
    const reads: string[] = [];
    const result = await runKeeper({
      adapter: adapter({
        async readKeeperStatus(address) {
          reads.push(address);
          return { ops: [{ method: "advance_round", args: [] }] };
        },
      }),
      config: config(),
    });
    expect(reads).toEqual([REPUBLIC, COURT]);
    expect(result.submitted).toBe(2);
  });

  it("paces StudioNet republic writes to one keeper window per hour", async () => {
    const studio = parseKeeperConfig({
      GENLAYER_KEEPER_PRIVATE_KEY: KEY,
      LOOPHOLE_REPUBLIC_ADDRESSES: REPUBLIC,
      NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
    });
    expect(studio.republicSlotSeconds).toBe(3600);
    const reads: number[] = [];
    const writes: string[] = [];
    const keeperAdapter = adapter({
      async readKeeperStatus() { reads.push(1); return { ops: [{ method: "advance_round", args: [] }] }; },
      async writeContract(_address, method) { writes.push(method); return HASH; },
    });

    const paced = await runKeeper({ adapter: keeperAdapter, config: studio, now: 7200 + 318 });
    expect(paced.results[0]).toMatchObject({ nextSlotAt: 10_800, status: "paced" });
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);

    const acted = await runKeeper({ adapter: keeperAdapter, config: studio, now: 7200 + 18 });
    expect(writes).toEqual(["advance_round"]);
    expect(acted.submitted).toBe(1);
  });

  it("allows pacing to be disabled or overridden", () => {
    const base = {
      GENLAYER_KEEPER_PRIVATE_KEY: KEY,
      LOOPHOLE_REPUBLIC_ADDRESSES: REPUBLIC,
      NEXT_PUBLIC_GENLAYER_NETWORK: "studionet",
    };
    expect(parseKeeperConfig({ ...base, NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS: "0" }).republicSlotSeconds).toBe(0);
    expect(parseKeeperConfig({ ...base, NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS: "1800" }).republicSlotSeconds).toBe(1800);
    expect(parseKeeperConfig({ ...base, NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS: "-5" }).republicSlotSeconds).toBe(3600);
    expect(config().republicSlotSeconds).toBe(0);
  });

  it("defers a StudioNet storage-budget refusal instead of reporting failure", async () => {
    const result = await runKeeper({
      adapter: adapter({
        async readKeeperStatus() { return { ops: [{ method: "advance_round", args: [] }] }; },
        async writeContract() {
          throw new Error("GenLayer RPC error (eth_sendRawTransaction): Contract 0x23d1 exceeded the daily snapshot storage budget (1 of 2 bytes used)");
        },
      }),
      config: { ...config(), courtAddresses: [] },
    });
    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.deferred).toBe(1);
    expect(result.results[0]).toMatchObject({ reason: "STUDIO_DAILY_STORAGE_BUDGET", status: "deferred" });
  });

  it("isolates a failed republic from court maintenance", async () => {
    const result = await runKeeper({
      adapter: adapter({
        async readKeeperStatus(address) {
          if (address === REPUBLIC) throw new Error("rpc unavailable");
          return { ops: [] };
        },
      }),
      config: config(),
    });
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(2);
  });
});
