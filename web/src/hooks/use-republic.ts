"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { demoSnapshot } from "@/lib/demo";
import { hasLiveRepublic } from "@/lib/genlayer";
import type { RepublicSnapshot } from "@/lib/types";

type AcceptedStateResponse = {
  observedAt: number;
  snapshot: RepublicSnapshot;
  stale: boolean;
};

async function readAcceptedState(force = false): Promise<AcceptedStateResponse> {
  const response = await fetch(force ? "/api/republic/state?fresh=1" : "/api/republic/state", {
    cache: force ? "no-store" : "default",
    headers: { Accept: "application/json" },
  });
  const body = await response.json() as Partial<AcceptedStateResponse> & { error?: string };
  if (!response.ok || !body.snapshot || typeof body.observedAt !== "number") {
    throw new Error(body.error ?? "Unable to read accepted GenLayer state.");
  }
  return body as AcceptedStateResponse;
}

export function useRepublic() {
  const [snapshot, setSnapshot] = useState<RepublicSnapshot | null>(() => hasLiveRepublic ? null : demoSnapshot);
  const [loading, setLoading] = useState(hasLiveRepublic);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const snapshotRef = useRef<RepublicSnapshot | null>(snapshot);

  const refresh = useCallback(async (force = false) => {
    if (!hasLiveRepublic) {
      setSnapshot(demoSnapshot);
      snapshotRef.current = demoSnapshot;
      setLoading(false);
      return;
    }
    if (!snapshotRef.current) setLoading(true);
    try {
      const accepted = await readAcceptedState(force);
      setSnapshot(accepted.snapshot);
      snapshotRef.current = accepted.snapshot;
      setError(accepted.stale ? "Showing the latest accepted state while StudioNet refreshes." : "");
      setUpdatedAt(accepted.observedAt);
    } catch (cause) {
      setError(snapshotRef.current
        ? "Showing the latest accepted state while StudioNet refreshes."
        : cause instanceof Error ? cause.message : "StudioNet accepted state is temporarily busy. Retrying automatically.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLiveRepublic) return;
    const kickoff = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { error, isDemo: !hasLiveRepublic, loading, refresh, snapshot, updatedAt };
}
