import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey } from "genlayer-js";
import { executeStep, loadWallets } from "./run-v7-demo.mjs";
import { FACTIONS, play, runScenario, stages } from "./v7-demo-scenario.mjs";
import { SafePauseError, ScenarioStopError, TransientRunError, exitCodeFor, installRpcRetries, retryTransient, runtimeLimit, save } from "./v7-runner-runtime.mjs";

const actions = () => FACTIONS.map((faction) => ({ faction, action_type: "BUILD_INFLUENCE", rationale: "Build influence during the round.", stances: [] }));

function context(initialPhase = "COMMIT", commits = [], reveals = []) {
  let phase = initialPhase;
  let round = 1;
  let expired = false;
  const state = { steps: {}, nonces: {}, expected_influence: Object.fromEntries(FACTIONS.map((f) => [f, 5])) };
  const committed = new Set(commits);
  const revealed = new Set(reveals);
  const events = [];
  const seed = (kind, faction) => ({ id: `r1:${kind}:${faction}`, tx_hash: `0x${kind}${faction}`, wallet: "A", method: `${kind}_action`, args: kind === "commit" ? [faction, "digest"] : [faction], status: "ACCEPTED_PENDING_FINALITY" });
  for (const faction of commits) { state.steps[`r1:commit:${faction}`] = seed("commit", faction); state.nonces[`1:${faction}`] = `${faction}-nonce`; }
  for (const faction of reveals) state.steps[`r1:reveal:${faction}`] = seed("reveal", faction);
  const ctx = {
    state, now: () => 0, sleep: async () => {}, saveState: async () => {},
    runtime: { exceeded: () => expired, remainingMs: () => expired ? 0 : Infinity },
    randomNonce: (r, f) => `${r}:${f}`,
    read: async ({ method }) => {
      if (method === "get_game") return { phase, round_number: round };
      if (method === "get_public_snapshot") return { factions: FACTIONS.map((faction) => ({ faction_id: faction, influence: 5 + (round - 1) * 2 })) };
      if (method === "preview_action_commitment") return "digest";
      return {};
    },
    submitAccepted: async (step) => {
      events.push(step.id);
      if (step.method === "commit_action") committed.add(step.args[0]);
      if (step.method === "reveal_action") revealed.add(step.args[0]);
      if (committed.size === 4 && phase === "COMMIT") phase = "REVEAL";
      if (revealed.size === 4) phase = "READY_TO_ADVANCE";
      if (step.method === "advance_round") { round += 1; phase = "COMMIT"; committed.clear(); revealed.clear(); if (ctx.expireAfterAdvance) expired = true; }
      return { ...step, tx_hash: `0x${step.id}`, status: "ACCEPTED_PENDING_FINALITY" };
    },
    setExpired: (value) => { expired = value; },
  };
  return { ctx, events };
}

describe("V7 runner robustness", () => {
  it("retries an EPERM atomic save and serializes concurrent saves", async () => {
    const fs = { mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn().mockRejectedValueOnce({ code: "EPERM" }).mockResolvedValue(undefined) };
    const sleep = vi.fn();
    await Promise.all([save("test-state", { version: 1 }, { fs, sleep }), save("test-state", { version: 2 }, { fs, sleep })]);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(fs.rename).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fs.writeFile.mock.calls.at(-1)[1])).toEqual({ version: 2 });
  });

  it("falls back to a direct save after ten rename retries", async () => {
    const fs = { mkdir: vi.fn(), writeFile: vi.fn(), rename: vi.fn().mockRejectedValue({ code: "EBUSY" }) };
    const warn = vi.fn();
    await save("test-state", { stored: true }, { fs, sleep: vi.fn(), warn });
    expect(fs.rename).toHaveBeenCalledTimes(11);
    expect(fs.writeFile.mock.calls.at(-1)[0]).toBe("test-state");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["COMMIT", FACTIONS.slice(0, 2), []],
    ["REVEAL", FACTIONS, FACTIONS.slice(0, 2)],
    ["READY_TO_ADVANCE", FACTIONS, FACTIONS],
  ])("resumes from %s with recorded partial steps", async (phase, commits, reveals) => {
    const { ctx, events } = context(phase, commits, reveals);
    await play(ctx, 1, actions());
    for (const f of commits) expect(events).not.toContain(`r1:commit:${f}`);
    for (const f of reveals) expect(events).not.toContain(`r1:reveal:${f}`);
    expect(events).toContain("r1:advance");
    expect(ctx.state.expected_influence.MERCHANTS).toBe(7);
  });

  it.each([["REVEAL", FACTIONS.slice(0, 3), []], ["READY_TO_ADVANCE", FACTIONS, FACTIONS.slice(0, 3)]])("stops a missed %s window with exit code 2", async (phase, commits, reveals) => {
    const { ctx, events } = context(phase, commits, reveals);
    const error = await play(ctx, 1, actions()).catch((value) => value);
    expect(error.message).toBe("Round 1 window missed; scripted story cannot continue — redeploy");
    expect(exitCodeFor(error)).toBe(2);
    expect(events).toEqual([]);
  });

  it("pauses after attached stages at READY before advance", async () => {
    const { ctx, events } = context();
    ctx.setExpired(true);
    const beforeAdvance = vi.fn();
    const error = await play(ctx, 1, actions(), { beforeAdvance }).catch((value) => value);
    expect(exitCodeFor(error)).toBe(75);
    expect(beforeAdvance).toHaveBeenCalledTimes(1);
    expect(events).toContain("r1:reveal:REVOLUTIONARIES");
    expect(events).not.toContain("r1:advance");
    ctx.setExpired(false);
    await play(ctx, 1, actions(), { beforeAdvance });
    expect(beforeAdvance).toHaveBeenCalledTimes(1);
  });

  it("reconciles pending receipt hashes after the reveal window closes", async () => {
    const { ctx, events } = context("READY_TO_ADVANCE", FACTIONS, FACTIONS);
    ctx.state.steps["r1:reveal:MERCHANTS"].status = "SUBMITTED";
    await play(ctx, 1, actions());
    expect(events.filter((id) => id.includes(":reveal:"))).toEqual(["r1:reveal:MERCHANTS"]);
    expect(events).toContain("r1:advance");
  });

  it("resumes after advance without applying influence twice", async () => {
    const { ctx, events } = context();
    const read = ctx.read;
    let interrupt = true;
    ctx.read = async (request) => {
      if (request.method === "get_public_snapshot" && events.includes("r1:advance") && interrupt) {
        interrupt = false;
        throw new TransientRunError("temporary read outage");
      }
      return read(request);
    };
    await expect(play(ctx, 1, actions())).rejects.toBeInstanceOf(TransientRunError);
    await play(ctx, 1, actions());
    expect(events.filter((id) => id === "r1:advance")).toHaveLength(1);
    expect(ctx.state.expected_influence.MERCHANTS).toBe(7);
  });

  it("never pauses after an advance before the next round's reveals", async () => {
    const { ctx, events } = context();
    ctx.expireAfterAdvance = true;
    const error = await runScenario(ctx, [
      { id: "r1", run: (c) => play(c, 1, actions()) },
      { id: "r2", run: (c) => play(c, 2, actions()) },
    ]).catch((value) => value);
    expect(error).toBeInstanceOf(SafePauseError);
    expect(events).toContain("r1:advance");
    expect(events).toContain("r2:reveal:REVOLUTIONARIES");
    expect(events).not.toContain("r2:advance");
  });

  it("pauses between stages only at a safe READY checkpoint", async () => {
    const { ctx } = context("READY_TO_ADVANCE", FACTIONS, FACTIONS);
    ctx.setExpired(true);
    const run = vi.fn();
    await expect(runScenario(ctx, [{ id: "r1", run }])).rejects.toBeInstanceOf(SafePauseError);
    expect(run).not.toHaveBeenCalled();
  });

  it("resumes the final fallback wait without waiting for a new COMMIT phase", async () => {
    const { ctx } = context("READY_TO_ADVANCE");
    ctx.state.fallback_prepared = true;
    ctx.state.fallback_wait_until = 3 * 60 * 60_000;
    ctx.read = async () => ({ round_number: 10, phase: "READY_TO_ADVANCE" });
    ctx.setExpired(true);
    const error = await stages.at(-1).run(ctx).catch((value) => value);
    expect(exitCodeFor(error)).toBe(75);
    expect(ctx.state.paused.location).toBe("round 10 fallback wait");
  });

  it("retries transient reads, but never retries scenario checks", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValue({ phase: "COMMIT" });
    const sleep = vi.fn();
    await expect(retryTransient(read, { sleep })).resolves.toEqual({ phase: "COMMIT" });
    expect(sleep).toHaveBeenCalledWith(15_000);
    const stop = vi.fn().mockRejectedValue(new ScenarioStopError("503 is not the expected label"));
    await expect(retryTransient(stop, { sleep })).rejects.toBeInstanceOf(ScenarioStopError);
    expect(stop).toHaveBeenCalledTimes(1);
    const fail = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const exhausted = await retryTransient(fail, { sleep }).catch((error) => error);
    expect(fail).toHaveBeenCalledTimes(7);
    expect(exitCodeFor(exhausted)).toBe(3);
    expect(exitCodeFor(new Error("wrapped", { cause: new TransientRunError("exhausted") }))).toBe(3);
  });

  it("retries the same write RPC payload rather than signing a new transaction", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValue(new Response('{"result":"0xhash"}', { status: 200 }));
    const rpc = installRpcRetries("https://studio.genlayer.com/api", { fetch, sleep: vi.fn() });
    const init = { method: "POST", body: '{"method":"eth_sendRawTransaction","params":["signed-bytes"]}' };
    await rpc("https://studio.genlayer.com/api", init);
    expect(fetch.mock.calls[0][1]).toBe(init);
    expect(fetch.mock.calls[1][1]).toBe(init);
  });

  it("uses a recorded transaction hash without submitting another write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "v7-record-"));
    try {
      const step = { id: "commit", wallet: "A", method: "commit_action", contract: "republic", args: [] };
      const state = { _state_path: join(dir, "state.json"), steps: { commit: { ...step, tx_hash: "0xsaved", status: "SUBMITTED" } } };
      const client = { writeContract: vi.fn(), waitForTransactionReceipt: vi.fn().mockResolvedValue({ statusName: "ACCEPTED", resultName: "AGREE", consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS" }] } }) };
      await executeStep(step, state, { A: client }, {}, {}, { acceptedOnly: true });
      expect(client.writeContract).not.toHaveBeenCalled();
      expect(client.waitForTransactionReceipt.mock.calls[0][0].hash).toBe("0xsaved");
      expect(JSON.parse(await readFile(state._state_path, "utf8")).steps.commit.status).toBe("ACCEPTED_PENDING_FINALITY");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("keeps environment wallets in memory without writing their keys to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "v7-wallets-"));
    try {
      const wallets = Object.fromEntries(["A", "B", "C", "D"].map((seat) => [seat, { privateKey: generatePrivateKey() }]));
      await expect(loadWallets({ V7_DEMO_WALLETS_JSON: JSON.stringify(wallets) }, join(dir, "wallets.json"))).resolves.toEqual(wallets);
      await expect(readFile(join(dir, "wallets.json"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("parses the runtime CLI limit and maps all exit classifications", () => {
    let clock = 0;
    const limit = runtimeLimit(["--max-runtime-minutes", "300"], 0, () => clock);
    expect(limit.exceeded()).toBe(false);
    clock = 300 * 60_000;
    expect(limit.exceeded()).toBe(true);
    expect(exitCodeFor(new Error("other"))).toBe(1);
    expect(() => runtimeLimit(["--max-runtime-minutes", "bad"])).toThrow();
  });
});
