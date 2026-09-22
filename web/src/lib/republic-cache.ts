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

  async function load(reader: SnapshotReader, now: number): Promise<AcceptedSnapshot> {
    try {
      const snapshot = await reader();
      const next = { observedAt: now, snapshot, stale: false };
      if (!accepted || now >= accepted.observedAt) accepted = next;
      return next;
    } catch (cause) {
      if (accepted && now - accepted.observedAt <= maxStaleMs) {
        return { ...accepted, stale: true };
      }
      throw cause;
    }
  }

  async function get(reader: SnapshotReader, now = Date.now(), force = false): Promise<AcceptedSnapshot> {
    if (force) return load(reader, now);
    if (accepted && now - accepted.observedAt < ttlMs) {
      return { ...accepted, stale: false };
    }
    if (inFlight) return inFlight;

    inFlight = load(reader, now);

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return { get };
}

export const republicSnapshotCache = createRepublicSnapshotCache();
