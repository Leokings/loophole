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
    async readCourt() { return { case_count: 0 }; },
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
        async readCourt() { return { case_count: 3 }; },
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
