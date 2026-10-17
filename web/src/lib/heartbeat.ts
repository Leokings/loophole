// Shared by the keeper, /api/health, and the UI badge so all three agree on when
// the republic is due, when the paced keeper will act, and when it is stalled.

export const KEEPER_WRITE_WINDOW_SECONDS = 300;
const STALL_GRACE_SECONDS = 600;
const STUDIONET_REPUBLIC_SLOT_SECONDS = 3600;
const MAX_SLOT_SECONDS = 24 * 60 * 60;

export type HeartbeatStatus = "ON_SCHEDULE" | "WAITING_FOR_KEEPER" | "STALLED";

export type HeartbeatGame = {
  commit_deadline?: number;
  commit_seconds?: number;
  objective_reveal_deadline?: number;
  phase?: string;
  opsPending?: number;
  reveal_deadline?: number;
  reveal_seconds?: number;
};

export type Heartbeat = {
  dueAt: number | null;
  expectedByAt: number | null;
  lastAdvanceAt: number | null;
  overdueSeconds: number;
  phase: string;
  slotSeconds: number;
  status: HeartbeatStatus;
};

function scalar(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * StudioNet caps each contract's daily snapshot storage, and every republic write
 * snapshots the whole contract. Pacing republic writes to one per slot keeps the
 * world moving all day instead of exhausting the budget early. 0 disables pacing.
 */
export function republicSlotSeconds(network: string | undefined, override: string | undefined) {
  const source = String(override ?? "").trim();
  if (source) {
    const parsed = Number(source);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return Math.min(parsed, MAX_SLOT_SECONDS);
  }
  return network === "studionet" ? STUDIONET_REPUBLIC_SLOT_SECONDS : 0;
}

export function isInKeeperWindow(now: number, slotSeconds: number) {
  return slotSeconds <= 0 || now % slotSeconds < KEEPER_WRITE_WINDOW_SECONDS;
}

export function nextKeeperSlotAt(now: number, slotSeconds: number) {
  if (slotSeconds <= 0) return now;
  const start = now - (now % slotSeconds);
  return isInKeeperWindow(now, slotSeconds) ? start : start + slotSeconds;
}

export function republicHeartbeat(game: HeartbeatGame, now: number, slotSeconds: number): Heartbeat {
  const phase = String(game.phase ?? "UNKNOWN");
  const commitDeadline = scalar(game.commit_deadline);
  const objectiveDeadline = scalar(game.objective_reveal_deadline);
  let lastAdvanceAt: number | null = null;
  if (commitDeadline > 0) lastAdvanceAt = commitDeadline - scalar(game.commit_seconds);
  else if (objectiveDeadline > 0) lastAdvanceAt = objectiveDeadline - scalar(game.reveal_seconds);

  let dueAt: number | null = null;
  if (phase === "READY_TO_ADVANCE") dueAt = scalar(game.reveal_deadline);
  if (phase === "READY_TO_FINALIZE_SEASON") dueAt = objectiveDeadline;

  if (dueAt === null || dueAt <= 0) {
    return { dueAt: null, expectedByAt: null, lastAdvanceAt, overdueSeconds: 0, phase, slotSeconds,
      status: scalar(game.opsPending) > 0 ? "WAITING_FOR_KEEPER" : "ON_SCHEDULE" };
  }
  // Upper bound: the first keeper window that opens at or after the deadline, plus that window.
  let expectedByAt = dueAt + KEEPER_WRITE_WINDOW_SECONDS;
  if (slotSeconds > 0) {
    const offset = dueAt % slotSeconds;
    expectedByAt = dueAt - offset + (offset === 0 ? 0 : slotSeconds) + KEEPER_WRITE_WINDOW_SECONDS;
  }
  const overdueSeconds = Math.max(0, now - dueAt);
  const status = now <= expectedByAt + STALL_GRACE_SECONDS ? "WAITING_FOR_KEEPER" : "STALLED";
  return { dueAt, expectedByAt, lastAdvanceAt, overdueSeconds, phase, slotSeconds, status };
}
