import { describe, expect, it } from "vitest";

import { assertTimingWindows, DEFAULT_V7_TIMINGS, releaseTimings } from "./v7-release-guards.mjs";

describe("V7 release timing guard", () => {
  it("accepts the reviewed 10800 second windows with a 900 second keeper slot", () => {
    expect(assertTimingWindows(DEFAULT_V7_TIMINGS)).toBe(true);
    expect(releaseTimings({})).toMatchObject({
      courtResolutionSeconds: 10800,
      fallbackGraceSeconds: 10800,
      judgmentWindowSeconds: 10800,
      keeperSlotSeconds: 900,
    });
  });

  it.each(["fallbackGraceSeconds", "judgmentWindowSeconds", "courtResolutionSeconds"])(
    "rejects %s shorter than three keeper slots",
    (windowName) => {
      expect(() => assertTimingWindows({ ...DEFAULT_V7_TIMINGS, [windowName]: 2699 }))
        .toThrow(`${windowName} must be at least three keeper slots (2700 seconds)`);
    },
  );

  it("rejects a non-integer keeper slot", () => {
    expect(() => assertTimingWindows({ ...DEFAULT_V7_TIMINGS, keeperSlotSeconds: 900.5 }))
      .toThrow("keeperSlotSeconds must be a positive integer");
  });
});
