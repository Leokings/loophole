import { describe, expect, it } from "vitest";

import { isInKeeperWindow, nextKeeperSlotAt, republicHeartbeat, republicSlotSeconds } from "./heartbeat";

const HOUR = 3600;

describe("republic heartbeat", () => {
  it("paces only StudioNet by default", () => {
    expect(republicSlotSeconds("studionet", undefined)).toBe(HOUR);
    expect(republicSlotSeconds("testnetBradbury", undefined)).toBe(0);
    expect(republicSlotSeconds("studionet", "900")).toBe(900);
    expect(republicSlotSeconds("studionet", "abc")).toBe(HOUR);
  });

  it("opens one five-minute keeper window per slot", () => {
    expect(isInKeeperWindow(HOUR * 5 + 18, HOUR)).toBe(true);
    expect(isInKeeperWindow(HOUR * 5 + 318, HOUR)).toBe(false);
    expect(isInKeeperWindow(123, 0)).toBe(true);
    expect(nextKeeperSlotAt(HOUR * 5 + 318, HOUR)).toBe(HOUR * 6);
    expect(nextKeeperSlotAt(HOUR * 5 + 18, HOUR)).toBe(HOUR * 5);
  });

  it("reports active phases as on schedule with the last advance time", () => {
    const beat = republicHeartbeat(
      { commit_deadline: 10_300, commit_seconds: 300, phase: "COMMIT", reveal_deadline: 10_600 },
      10_100,
      HOUR,
    );
    expect(beat).toMatchObject({ dueAt: null, lastAdvanceAt: 10_000, status: "ON_SCHEDULE" });
  });

  it("waits for the next keeper window, then flags a stall", () => {
    const game = { commit_deadline: 9_000, commit_seconds: 300, phase: "READY_TO_ADVANCE", reveal_deadline: 9_300 };
    const waiting = republicHeartbeat(game, 9_400, HOUR);
    expect(waiting).toMatchObject({ dueAt: 9_300, expectedByAt: 3 * HOUR + 300, status: "WAITING_FOR_KEEPER" });
    expect(republicHeartbeat(game, 3 * HOUR + 300 + 600, HOUR).status).toBe("WAITING_FOR_KEEPER");
    expect(republicHeartbeat(game, 3 * HOUR + 300 + 601, HOUR).status).toBe("STALLED");
  });

  it("treats a finalized season as due from the objective reveal deadline", () => {
    // Live V6 state on 2026-10-16: SEASON_FINAL, reveal deadline 07:05:54 UTC, observed 20:21 UTC.
    const beat = republicHeartbeat(
      { commit_deadline: 0, objective_reveal_deadline: 1_792_134_354, phase: "SEASON_FINAL", reveal_seconds: 300 },
      1_792_182_091,
      HOUR,
    );
    expect(beat.status).toBe("STALLED");
    expect(beat.lastAdvanceAt).toBe(1_792_134_054);
    expect(beat.overdueSeconds).toBe(47_737);
  });
});
