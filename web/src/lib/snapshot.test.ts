import { describe, expect, it, vi } from "vitest";

import { readBoundedRepublicSnapshot } from "./snapshot";

describe("bounded public snapshot reads", () => {
  it("snapshot reads stay bounded for an old world", async () => {
    const laws = Array.from({ length: 32 }, (_, index) => ({
      law_id: index + 1,
      status: index < 16 ? "ENACTED" : "SUPERSEDED",
      text: `Law ${index + 1}`,
      title: `Rule ${index + 1}`,
    }));
    const cases = Array.from({ length: 84 }, (_, index) => ({
      case_id: index + 1,
      status: index < 64 ? "BRIEFING" : "DECIDED",
      law_id: 1,
      label: index < 64 ? "" : "NOT_COVERED",
      verdict: index < 64 ? "" : "NO_VIOLATION",
      holding_present: index >= 64,
      outcome_present: index >= 64,
      evidence_json: "{}",
    }));
    const read = vi.fn(async (_address: string, method: string) => {
      if (method === "get_public_snapshot") return {
        game: { law_count: 520, round_number: 100, phase: "COMMIT" },
        laws,
        factions: [],
        offices: [],
        objectives: [],
        current_actions: [],
        recent_actions: [],
        suit_targets: [{ action_round: 99, action_type: "UNDERMINE", defendant_faction_id: "A", law_id: 3,
          key: "3|UNDERMINE|OFFICEHOLDER", law_title: "Office law", target_class: "OFFICEHOLDER" }],
        keeper_status: { now: 0, ops: [] },
        storage_stats: {},
      };
      if (method === "get_docket") return {
        cases,
        court: { case_count: 80, open_case_count: 64 },
        keeper_status: { now: 0, ops: [] },
        storage_stats: {},
      };
      if (method === "get_registry_summary") return { holding_count: 1 };
      if (method === "get_holdings_for_laws") return [];
      throw new Error(`Unexpected per-record read: ${method}`);
    });

    const snapshot = await readBoundedRepublicSnapshot(read, {
      republic: "republic",
      court: "court",
      caseLaw: "caselaw",
    });

    expect(read.mock.calls.length).toBeLessThanOrEqual(8);
    expect(read.mock.calls.map(([, method]) => method)).toEqual([
      "get_public_snapshot",
      "get_docket",
      "get_registry_summary",
      "get_holdings_for_laws",
    ]);
    expect(snapshot.game.law_count).toBe(520);
    expect(snapshot.cases).toHaveLength(84);
    expect(snapshot.suitTargets[0]?.key).toBe("3|UNDERMINE|OFFICEHOLDER");
  });
});
