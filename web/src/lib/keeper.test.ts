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
    async readCourt() { return { open_case_count: 0 }; },
    async readOpenCaseIds() { return []; },
    async readRepublic() { return { phase: "COMMIT" }; },
    async writeCourt() { return HASH; },
    async writeRepublic() { return HASH; },
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

  it.each([
    ["READY_TO_ADVANCE", "advance_round"],
    ["READY_TO_FINALIZE_SEASON", "finalize_season"],
    ["SEASON_FINAL", "start_next_season"],
  ])("maps republic phase %s to %s", async (phase, expectedMethod) => {
    const writes: string[] = [];
    const result = await runKeeper({
      adapter: adapter({
        async readRepublic() { return { phase }; },
        async writeRepublic(_address, method) { writes.push(method); return HASH; },
      }),
      config: { ...config(), courtAddresses: [] },
    });
    expect(writes).toEqual([expectedMethod]);
    expect(result.submitted).toBe(1);
  });

  it("advances only court cases whose deadline has passed", async () => {
    const writes: string[] = [];
    const result = await runKeeper({
      adapter: adapter({
        async readCourt() { return { open_case_count: 3 }; },
        async readOpenCaseIds() { return [1, 2, 3]; },
        async readCase(_address, caseId) {
          if (caseId === 1) return { status: "BRIEFING", brief_deadline: 90 };
          if (caseId === 2) return { status: "APPEAL_WINDOW", appeal_deadline: 101 };
          return { status: "APPEALED", appeal_response_deadline: 80 };
        },
        async writeCourt(_address, method) { writes.push(method); return HASH; },
      }),
      config: { ...config(), republicAddresses: [] },
      now: 100,
    });
    expect(writes).toEqual(["resolve_case", "resolve_appeal"]);
    expect(result.submitted).toBe(2);
  });

  it("keeps an old unresolved case visible after many newer cases are filed", async () => {
    const reads: number[] = [];
    const writes: Array<{ caseId: number; method: string }> = [];
    const result = await runKeeper({
      adapter: adapter({
        async readCourt() { return { case_count: 100, open_case_count: 1 }; },
        async readOpenCaseIds(_address, limit) {
          expect(limit).toBe(1);
          return [1];
        },
        async readCase(_address, caseId) {
          reads.push(caseId);
          return { status: "BRIEFING", brief_deadline: 90 };
        },
        async writeCourt(_address, method, args) {
          writes.push({ caseId: Number(args[0]), method });
          return HASH;
        },
      }),
      config: { ...config(), maxContracts: 1, republicAddresses: [] },
      now: 100,
    });

    expect(reads).toEqual([1]);
    expect(writes).toEqual([{ caseId: 1, method: "resolve_case" }]);
    expect(result.submitted).toBe(1);
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
      async readRepublic() { reads.push(1); return { phase: "READY_TO_ADVANCE" }; },
      async writeRepublic(_address, method) { writes.push(method); return HASH; },
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
        async readRepublic() { return { phase: "SEASON_FINAL" }; },
        async writeRepublic() {
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
        async readRepublic() { throw new Error("rpc unavailable"); },
      }),
      config: config(),
    });
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.processed).toBe(2);
  });
});
