import { hasLiveRepublic, readRepublicSnapshot } from "@/lib/genlayer";
import { republicSnapshotCache } from "@/lib/republic-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACCEPTED_STATE_CACHE = {
  "Cache-Control": "public, max-age=15, stale-while-revalidate=285",
  "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
};

const NO_STORE = { "Cache-Control": "no-store", "Retry-After": "30" };

export async function GET(request: Request) {
  if (!hasLiveRepublic) {
    return Response.json(
      { error: "No live republic contract is configured." },
      { headers: NO_STORE, status: 503 },
    );
  }

  try {
    const force = new URL(request.url).searchParams.get("fresh") === "1";
    const accepted = await republicSnapshotCache.get(readRepublicSnapshot, Date.now(), force);
    return Response.json(accepted, { headers: force ? { "Cache-Control": "no-store" } : ACCEPTED_STATE_CACHE });
  } catch (cause) {
    console.error("Accepted-state refresh failed", cause);
    return Response.json(
      { error: "StudioNet accepted state is temporarily busy. Retrying automatically." },
      { headers: NO_STORE, status: 503 },
    );
  }
}
