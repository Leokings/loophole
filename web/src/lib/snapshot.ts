import type {
  CourtCase,
  CourtState,
  Crisis,
  KeeperStatus,
  RepublicSnapshot,
  StorageStats,
} from "@/lib/types";

export type SnapshotRead = (address: string, method: string, args?: unknown[]) => Promise<unknown>;

function serializable<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? Number(item) : item)) as T;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function readBoundedRepublicSnapshot(
  read: SnapshotRead,
  addresses: { republic: string; court?: string; caseLaw?: string },
): Promise<RepublicSnapshot> {
  const raw = await read(addresses.republic, "get_public_snapshot");
  const republic = serializable<Record<string, unknown>>(typeof raw === "string" ? JSON.parse(raw) : raw);
  const courtRaw = addresses.court ? serializable(await read(addresses.court, "get_docket", [20])) : null;
  const caseLawAddress = addresses.caseLaw;
  const [registryRaw, holdingResults] = caseLawAddress
    ? await Promise.all([
      read(caseLawAddress, "get_registry_summary").then(serializable),
      Promise.all(batches((republic.laws as Array<{ law_id: number }> ?? []).map((law) => law.law_id), 64)
        .map((ids) => read(caseLawAddress, "get_holdings_for_laws", [JSON.stringify(ids)]).then(serializable))),
    ])
    : [null, []];

  const court = courtRaw as ({ cases: CourtCase[]; court: CourtState; keeper_status: KeeperStatus; storage_stats: StorageStats } | null);
  const lawHistory = (republic.laws ?? []) as RepublicSnapshot["lawHistory"];
  const rawSuitTargets = (republic.suit_targets ?? []) as Array<Record<string, unknown>>;
  const cases = (court?.cases ?? []).map((item) => {
    const pendingHolding = item.label !== "UNCLEAR" && item.status !== "EXPIRED" && !item.holding_present;
    const pendingOutcome = item.verdict !== "AMBIGUOUS" && item.status !== "EXPIRED" && !item.outcome_present;
    const effectsPending: CourtCase["effectsPending"] = pendingHolding && pendingOutcome ? "holding and outcome"
      : pendingHolding ? "holding" : pendingOutcome ? "outcome" : undefined;
    return { ...item, effectsPending };
  });
  const republicKeeper = (republic.keeper_status ?? { now: 0, phase: "", ops: [] }) as KeeperStatus;
  const republicStats = (republic.storage_stats ?? {}) as StorageStats;
  return {
    cases,
    court: court?.court ?? null,
    crisis: (() => {
      const crisis = republic.crisis as (Crisis & { responses_json?: string }) | null;
      if (!crisis) return null;
      const responses = parseJson<Crisis["responses"]>(crisis.responses_json, []);
      const judgments = parseJson<{ labels?: Record<string, string>; quotes?: Record<string, string> }>(crisis.resolution_json, {});
      return {
        ...crisis,
        severity_source: "CODE_DERIVED",
        outcome: crisis.outcome || "",
        responses: responses.map((response) => {
          let judgment = response.judgment ?? "";
          let quote = response.quote ?? "";
          if (judgment.startsWith("{")) {
            const parsed = parseJson<{ label?: string; quote?: string }>(judgment, {});
            judgment = parsed.label ?? "INSUFFICIENT";
            quote = parsed.quote ?? "";
          }
          return { ...response, judgment: judgments.labels?.[response.faction_id] ?? judgment,
            quote: judgments.quotes?.[response.faction_id] ?? quote };
        }),
      };
    })(),
    current_actions: (republic.current_actions ?? []) as RepublicSnapshot["current_actions"],
    factions: (republic.factions ?? []) as RepublicSnapshot["factions"],
    game: republic.game as RepublicSnapshot["game"],
    laws: lawHistory.filter((law) => ["ENACTED", "PENDING"].includes(law.status)),
    offices: (republic.offices ?? []) as RepublicSnapshot["offices"],
    objectives: (republic.objectives ?? []) as RepublicSnapshot["objectives"],
    summary: (republic.last_summary ?? null) as RepublicSnapshot["summary"],
    keeperStatus: { republic: republicKeeper, court: court?.keeper_status ?? null },
    storageStats: { republic: republicStats, court: court?.storage_stats ?? null },
    holdings: holdingResults.flatMap((result) => result as RepublicSnapshot["holdings"]),
    registry: registryRaw as RepublicSnapshot["registry"],
    suitTargets: rawSuitTargets.map((target) => ({
      actionRound: Number(target.action_round),
      actionType: String(target.action_type),
      defendantFactionId: String(target.defendant_faction_id),
      lawId: Number(target.law_id),
      lawTitle: String(target.law_title),
      targetClass: String(target.target_class),
    })) as RepublicSnapshot["suitTargets"],
    historicalActions: (republic.recent_actions ?? []) as RepublicSnapshot["historicalActions"],
    lawHistory,
  };
}
