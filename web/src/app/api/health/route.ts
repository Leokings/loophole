import { republicHeartbeat } from "@/lib/heartbeat";
import { hasLiveRepublic, keeperSlotSeconds, readRepublicSnapshot, republicAddress } from "@/lib/genlayer";
import { republicSnapshotCache } from "@/lib/republic-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEALTH_CACHE = { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" };
const NO_STORE = { "Cache-Control": "no-store", "Retry-After": "30" };

// Public, secret-free liveness report. It reuses the accepted-state cache, so a
// health check adds no StudioNet RPC load beyond the state route's own refresh.
export async function GET() {
  if (!hasLiveRepublic) {
    return Response.json({ error: "No live republic contract is configured.", ok: false }, { headers: NO_STORE, status: 503 });
  }
  try {
    const accepted = await republicSnapshotCache.get(readRepublicSnapshot);
    const now = Math.floor(Date.now() / 1000);
    const { game } = accepted.snapshot;
    const heartbeat = republicHeartbeat(game, now, keeperSlotSeconds);
    return Response.json(
      {
        heartbeat,
        now,
        observedAt: Math.floor(accepted.observedAt / 1000),
        ok: heartbeat.status !== "STALLED",
        republic: republicAddress,
        round: game.round_number,
        season: game.season_number,
        stale: accepted.stale,
        storageBudgetNote:
          "StudioNet limits each contract's daily snapshot storage; refused writes resume after 00:00 UTC.",
      },
      { headers: HEALTH_CACHE },
    );
  } catch (cause) {
    console.error("Health read failed", cause);
    return Response.json({ error: "StudioNet accepted state is temporarily unavailable.", ok: false }, { headers: NO_STORE, status: 503 });
  }
}
