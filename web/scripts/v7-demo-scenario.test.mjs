import { describe, expect, it } from "vitest";

import {
  FACTIONS,
  ScenarioStopError,
  assertExpectedLabel,
  awaitEffects,
  play,
  scenarioConstants,
  stages,
} from "./v7-demo-scenario.mjs";

function baseState() {
  return { steps: {}, nonces: {}, readbacks: {}, case_ids: {}, case_keys: {} };
}

function roundContext() {
  const state = baseState();
  const events = [];
  let phase = "COMMIT";
  let round = 1;
  let commits = 0;
  let reveals = 0;
  const influences = Object.fromEntries(FACTIONS.map((faction) => [faction, 5]));
  const ctx = {
    state,
    randomNonce: (currentRound, faction) => `${currentRound}-${faction}-nonce`,
    saveState: async () => events.push({ type: "save", nonces: { ...state.nonces } }),
    read: async ({ method }) => {
      if (method === "get_public_snapshot") return { factions: FACTIONS.map((faction) => ({ faction_id: faction, influence: influences[faction] })) };
      if (method === "get_game") return { phase, round_number: round, active_crisis_id: 0 };
      if (method === "preview_action_commitment") return "commitment";
      if (method === "get_round_summary") return { actions: [] };
      if (method === "get_docket" || method === "get_registry_summary" || method === "get_storage_stats") return {};
      return {};
    },
    submitAccepted: async (step) => {
      events.push({ type: "commit-or-reveal", method: step.method, id: step.id });
      if (step.method === "commit_action") commits += 1;
      if (step.method === "reveal_action") reveals += 1;
      if (commits === 4) phase = "REVEAL";
      if (reveals === 4) phase = "READY_TO_ADVANCE";
      return { ...step, tx_hash: `0x${step.id}`, status: "ACCEPTED_PENDING_FINALITY" };
    },
    executeStep: async (step) => {
      events.push({ type: "execute", method: step.method, id: step.id });
      if (step.method === "advance_round") {
        for (const faction of FACTIONS) influences[faction] = Math.min(20, influences[faction] + 2);
        round = 2; phase = "COMMIT";
      }
      return { ...step, tx_hash: `0x${step.id}`, status: "FINALIZED_SUCCESS" };
    },
    sleep: async () => {},
    pollIntervalMs: scenarioConstants.pollPhaseMs,
  };
  return { ctx, events };
}

describe("V7 code-defined live demo scenario", () => {
  it("exports the authoritative stage order", () => {
    expect(stages.map((stage) => stage.id)).toEqual([
      "claims", "r1", "certify", "r2", "r3", "crisis_open", "r4", "r5",
      "crisis_judge", "cases_r5", "r6", "certify_v2", "summary", "r7", "r8",
      "r9", "cases_r9", "r10_fallback",
    ]);
  });

  it("persists every nonce before submitting its commit", async () => {
    const { ctx, events } = roundContext();
    await play(ctx, 1, FACTIONS.map((faction) => ({ faction, action_type: "BUILD_INFLUENCE", rationale: "Build influence for this round." })), { stageId: "test" });
    const firstCommit = events.findIndex((event) => event.type === "commit-or-reveal" && event.method === "commit_action");
    expect(firstCommit).toBeGreaterThan(0);
    expect(events[firstCommit - 1].type).toBe("save");
    expect(Object.keys(events[firstCommit - 1].nonces)).toEqual(["1:MERCHANTS"]);
  });

  it("stops on the injection case returning an unexpected label", async () => {
    const ctx = {
      state: { ...baseState(), case_ids: { C: 3 }, case_keys: { C: "2|GROW_WEALTH|NONE" } },
      read: async () => ({ label: "COVERED_BREACH", key: "2|GROW_WEALTH|NONE" }),
      saveState: async () => {},
    };
    await expect(assertExpectedLabel(ctx, "C", "NOT_COVERED")).rejects.toBeInstanceOf(ScenarioStopError);
  });

  it("keeps the three-hour fallback stage last", () => {
    expect(stages.at(-1).id).toBe("r10_fallback");
    expect(stages.slice(0, -1).some((stage) => stage.id === "r10_fallback")).toBe(false);
  });

  it("records both automatic and recovered multi-emit outcomes", async () => {
    const delivered = {
      state: { ...baseState(), case_ids: { A: 1 }, case_keys: { A: "2|UNDERMINE|OTHER_FACTION" } },
      read: async ({ contract }) => contract === "caseLaw" ? { key: "holding" } : "outcome",
      saveState: async () => {},
      now: () => 0,
      sleep: async () => {},
    };
    await expect(awaitEffects(delivered, "A")).resolves.toMatchObject({ multi_emit_delivered: true });

    let clock = 0;
    const recovered = {
      state: { ...baseState(), case_ids: { B: 2 }, case_keys: { B: "2|UNDERMINE|OFFICEHOLDER" } },
      read: async ({ contract }) => contract === "caseLaw" ? {} : "",
      executeStep: async () => ({ tx_hash: "0xrecovery" }),
      saveState: async () => {},
      now: () => clock,
      sleep: async () => { clock = 1_800_001; },
    };
    await expect(awaitEffects(recovered, "B", { maxWaitMs: 0 })).resolves.toMatchObject({ multi_emit_delivered: false, recovery_tx: "0xrecovery" });
  });
});

