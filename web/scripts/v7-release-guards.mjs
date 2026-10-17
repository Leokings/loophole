export const DEFAULT_V7_TIMINGS = Object.freeze({
  briefSeconds: 600,
  commitSeconds: 300,
  courtResolutionSeconds: 10_800,
  fallbackGraceSeconds: 10_800,
  judgmentWindowSeconds: 10_800,
  keeperSlotSeconds: 900,
  revealSeconds: 300,
  seasonRounds: 12,
});

export function assertTimingWindows(settings) {
  if (!Number.isSafeInteger(settings.keeperSlotSeconds) || settings.keeperSlotSeconds <= 0) {
    throw new Error("keeperSlotSeconds must be a positive integer");
  }
  const minimum = settings.keeperSlotSeconds * 3;
  for (const [name, seconds] of Object.entries({
    fallbackGraceSeconds: settings.fallbackGraceSeconds,
    judgmentWindowSeconds: settings.judgmentWindowSeconds,
    courtResolutionSeconds: settings.courtResolutionSeconds,
  })) {
    if (!Number.isSafeInteger(seconds) || seconds < minimum) {
      throw new Error(`${name} must be at least three keeper slots (${minimum} seconds)`);
    }
  }
  return true;
}

export function releaseTimings(env = process.env) {
  const integer = (name, fallback, min, max) => {
    const raw = env[name];
    const value = raw === undefined || raw === "" ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer from ${min} through ${max}`);
    }
    return value;
  };
  const timings = {
    briefSeconds: integer("LOOPHOLE_BRIEF_SECONDS", DEFAULT_V7_TIMINGS.briefSeconds, 60, 604_800),
    commitSeconds: integer("LOOPHOLE_COMMIT_SECONDS", DEFAULT_V7_TIMINGS.commitSeconds, 60, 604_800),
    courtResolutionSeconds: integer("LOOPHOLE_COURT_RESOLUTION_SECONDS", DEFAULT_V7_TIMINGS.courtResolutionSeconds, 60, 604_800),
    fallbackGraceSeconds: integer("LOOPHOLE_FALLBACK_GRACE_SECONDS", DEFAULT_V7_TIMINGS.fallbackGraceSeconds, 60, 604_800),
    judgmentWindowSeconds: integer("LOOPHOLE_JUDGMENT_WINDOW_SECONDS", DEFAULT_V7_TIMINGS.judgmentWindowSeconds, 60, 604_800),
    keeperSlotSeconds: integer("NEXT_PUBLIC_LOOPHOLE_KEEPER_SLOT_SECONDS", DEFAULT_V7_TIMINGS.keeperSlotSeconds, 60, 86_400),
    revealSeconds: integer("LOOPHOLE_REVEAL_SECONDS", DEFAULT_V7_TIMINGS.revealSeconds, 60, 604_800),
    seasonRounds: integer("LOOPHOLE_SEASON_ROUNDS", DEFAULT_V7_TIMINGS.seasonRounds, 8, 30),
  };
  assertTimingWindows(timings);
  return timings;
}
