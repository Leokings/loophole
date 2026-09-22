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

  it("forces a post-transaction read instead of returning the cached snapshot", async () => {
    const cache = createRepublicSnapshotCache({ ttlMs: 60_000 });
    const updatedSnapshot = {
      ...demoSnapshot,
      game: { ...demoSnapshot.game, round_number: demoSnapshot.game.round_number + 1 },
    };
    await cache.get(async () => demoSnapshot, 1_000);

    const result = await cache.get(async () => updatedSnapshot, 2_000, true);

    expect(result.snapshot.game.round_number).toBe(updatedSnapshot.game.round_number);
    expect(result.observedAt).toBe(2_000);
  });

  it("does not let an older in-flight read hide a forced post-transaction refresh", async () => {
    const cache = createRepublicSnapshotCache({ ttlMs: 60_000 });
    const updatedSnapshot = {
      ...demoSnapshot,
      game: { ...demoSnapshot.game, round_number: demoSnapshot.game.round_number + 1 },
    };
    let releaseOlderRead: (() => void) | undefined;
    const olderRead = cache.get(() => new Promise((resolve) => {
      releaseOlderRead = () => resolve(demoSnapshot);
    }), 1_000);

    const forced = await cache.get(async () => updatedSnapshot, 2_000, true);
    releaseOlderRead?.();
    await olderRead;
    const cached = await cache.get(async () => demoSnapshot, 2_500);

    expect(forced.snapshot.game.round_number).toBe(updatedSnapshot.game.round_number);
    expect(cached.snapshot.game.round_number).toBe(updatedSnapshot.game.round_number);
    expect(cached.observedAt).toBe(2_000);
  });
});
