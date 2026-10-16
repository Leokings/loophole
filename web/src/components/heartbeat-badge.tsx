"use client";

import { useEffect, useState } from "react";

import { keeperSlotSeconds } from "@/lib/genlayer";
import { republicHeartbeat } from "@/lib/heartbeat";
import type { GameState } from "@/lib/types";

function elapsed(seconds: number) {
  if (seconds < 90) return "just now";
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

function overdue(seconds: number) {
  return seconds < 5400 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds / 3600)} h`;
}

function clock(epoch: number) {
  return new Date(epoch * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HeartbeatBadge({ game, isDemo }: { game: GameState; isDemo: boolean }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (isDemo) {
    return <span className="heartbeat"><i className="consensus-light" /> Demonstration world</span>;
  }

  const beat = republicHeartbeat(game, now, keeperSlotSeconds);
  if (beat.status === "STALLED") {
    return (
      <span className="heartbeat stalled" title="StudioNet limits each contract's daily snapshot storage. Refused writes resume after 00:00 UTC, and anyone may call the ready method.">
        <i className="consensus-light" /> Advance overdue {overdue(beat.overdueSeconds)} · anyone may advance
      </span>
    );
  }
  if (beat.status === "WAITING_FOR_KEEPER" && beat.expectedByAt) {
    return (
      <span className="heartbeat waiting">
        <i className="consensus-light" /> Ready · keeper acts by {clock(beat.expectedByAt)}
      </span>
    );
  }
  return (
    <span className="heartbeat">
      <i className="consensus-light" /> Republic live
      {beat.lastAdvanceAt ? ` · advanced ${elapsed(Math.max(0, now - beat.lastAdvanceAt))}` : ""}
    </span>
  );
}
