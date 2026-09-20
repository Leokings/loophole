import type { RepublicSnapshot } from "@/lib/types";

export type AcceptedSnapshot = {
  observedAt: number;
  snapshot: RepublicSnapshot;
  stale: boolean;
};

type SnapshotReader = () => Promise<RepublicSnapshot>;

export function createRepublicSnapshotCache({
  maxStaleMs = 15 * 60_000,
  ttlMs = 295_000,
}: {
  maxStaleMs?: number;
  ttlMs?: number;
} = {}) {
  let accepted: AcceptedSnapshot | null = null;
  let inFlight: Promise<AcceptedSnapshot> | null = null;

  async function get(reader: SnapshotReader, now = Date.now()): Promise<AcceptedSnapshot> {
    if (accepted && now - accepted.observedAt < ttlMs) {
      return { ...accepted, stale: false };
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const snapshot = await reader();
        accepted = { observedAt: now, snapshot, stale: false };
        return accepted;
      } catch (cause) {
        if (accepted && now - accepted.observedAt <= maxStaleMs) {
          return { ...accepted, stale: true };
        }
        throw cause;
      }
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return { get };
}

export const republicSnapshotCache = createRepublicSnapshotCache();
