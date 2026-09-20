import { describe, expect, it, vi } from "vitest";

import { demoSnapshot } from "./demo";
import { createRepublicSnapshotCache } from "./republic-cache";

describe("republic snapshot cache", () => {
  it("collapses concurrent reads and reuses a fresh accepted snapshot", async () => {
    const cache = createRepublicSnapshotCache({ ttlMs: 60_000 });
    const reader = vi.fn(async () => demoSnapshot);

    const [first, second] = await Promise.all([
      cache.get(reader, 1_000),
      cache.get(reader, 1_000),
    ]);
    const cached = await cache.get(reader, 2_000);

    expect(reader).toHaveBeenCalledTimes(1);
    expect(first.snapshot.game.republic_id).toBe("FIRST-REPUBLIC");
    expect(second.stale).toBe(false);
    expect(cached.stale).toBe(false);
  });

  it("serves the last accepted snapshot when a refresh is temporarily rate limited", async () => {
    const cache = createRepublicSnapshotCache({ maxStaleMs: 120_000, ttlMs: 10_000 });
    await cache.get(async () => demoSnapshot, 1_000);

    const result = await cache.get(async () => {
      throw new Error("Rate limit exceeded");
    }, 20_000);

    expect(result.snapshot).toBe(demoSnapshot);
    expect(result.stale).toBe(true);
    expect(result.observedAt).toBe(1_000);
  });

  it("throws when no accepted snapshot exists", async () => {
    const cache = createRepublicSnapshotCache();

    await expect(cache.get(async () => {
      throw new Error("offline");
    })).rejects.toThrow("offline");
  });
});
