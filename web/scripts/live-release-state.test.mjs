import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey } from "genlayer-js";
import { describe, expect, it } from "vitest";
import { dirtyReleasePaths } from "./deploy-loophole.mjs";
import { assertNoSecrets, checkPreconditions, persistState, restoreState, selectRelease, summarize } from "./live-release-state.mjs";

const exec = promisify(execFile);
const git = async (cwd, args) => (await exec("git", args, { cwd })).stdout.trim();
const keys = () => ({
  ...process.env,
  GENLAYER_DEPLOYER_PRIVATE_KEY: generatePrivateKey(),
  V7_DEMO_WALLETS_JSON: JSON.stringify(Object.fromEntries(["A", "B", "C", "D"].map((seat) => [seat, { privateKey: generatePrivateKey() }]))),
  LOOPHOLE_COMMIT_SECONDS: "1200", LOOPHOLE_REVEAL_SECONDS: "600", LOOPHOLE_REPUBLIC_ID: "LOOPHOLE-STUDIONET-V7", GITHUB_ACTIONS: "false",
});

async function repository() {
  const folder = await mkdtemp(join(tmpdir(), "v7-state-"));
  const root = join(folder, "repo");
  const remote = join(folder, "origin.git");
  await mkdir(root);
  await git(folder, ["init", "--bare", remote]);
  await git(root, ["init", "-b", "v7"]);
  await git(root, ["config", "user.name", "Checkpoint tests"]);
  await git(root, ["config", "user.email", "tests@example.invalid"]);
  await mkdir(join(root, "contracts"));
  await writeFile(join(root, "contracts", "AutonomousRepublic.py"), "checkpoint contract source\n");
  await writeFile(join(root, "README.md"), "Source checkout\n");
  await git(root, ["add", "README.md", "contracts/AutonomousRepublic.py"]);
  await git(root, ["commit", "-m", "source"]);
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["push", "-u", "origin", "v7"]);
  const commit = await git(root, ["rev-parse", "HEAD"]);
  await mkdir(join(root, "deployments"));
  return { folder, root, remote, commit };
}
const release = (commit) => ({
  version: 1,
  network: "studionet",
  commit,
  contracts: {
    republic: { address: "0x0000000000000000000000000000000000000001" },
    caseLaw: { address: "0x0000000000000000000000000000000000000002" },
    court: { address: "0x0000000000000000000000000000000000000003" },
  },
  constructor_args: { commitSeconds: 1200, revealSeconds: 600 },
});

describe("GitHub live-release checkpoints", () => {
  it("permits only untracked release records in CI; code changes still fail the clean-tree gate", () => {
    const dirty = "?? deployments/studionet-time.json\n M web/scripts/run-v7-demo.mjs\n?? unknown.json\n";
    expect(dirtyReleasePaths(dirty, true)).toEqual([" M web/scripts/run-v7-demo.mjs", "?? unknown.json"]);
    expect(dirtyReleasePaths(dirty, false)).toHaveLength(3);
    expect(dirtyReleasePaths(" M deployments/studionet-time.json", true)).toHaveLength(1);
  });

  it("rejects key fields and secret values in checkpoint files", () => {
    expect(() => assertNoSecrets('{"privateKey":"hidden"}', {})).toThrow("private key material");
    expect(() => assertNoSecrets("secret material", { GENLAYER_DEPLOYER_PRIVATE_KEY: "secret" })).toThrow();
    expect(() => assertNoSecrets('{"tx_hash":"0xpublic"}', {})).not.toThrow();
  });

  it("round-trips allowlisted state without updating the source branch", async () => {
    const { folder, root, commit } = await repository();
    try {
      await restoreState(root); // A missing branch is an empty start, not an error.
      const recordName = "studionet-test.json";
      await writeFile(join(root, "deployments", recordName), JSON.stringify(release(commit)));
      await mkdir(join(root, "deploy"));
      const state = { completed_stages: ["claims", "r1"], current_game: { round_number: 2, phase: "READY_TO_ADVANCE" }, steps: { one: { status: "FINALIZED_SUCCESS" } }, deployment_artifact: `deployments/${recordName}` };
      await writeFile(join(root, "deploy", "demo-state.json"), JSON.stringify(state));
      await mkdir(join(root, ".live-evidence/actions"), { recursive: true });
      await writeFile(join(root, ".live-evidence/v7-deployment-state.json"), JSON.stringify({ commit, transactions: {} }));
      await writeFile(join(root, ".live-evidence/actions/run.log"), "Private sentinel: secret-to-redact\n");
      await mkdir(join(root, "web/scripts"), { recursive: true });
      await writeFile(join(root, "web/scripts/runner.mjs"), "runner-only change\n");
      await git(root, ["add", "web/scripts/runner.mjs"]);
      await git(root, ["commit", "-m", "runner-only change"]);
      const resumeCommit = await git(root, ["rev-parse", "HEAD"]);
      const env = { ...process.env, GENLAYER_DEPLOYER_PRIVATE_KEY: "secret-to-redact", GITHUB_RUN_ID: "123" };
      await persistState(root, "resume", 75, env);
      expect(await git(root, ["rev-parse", "HEAD"])).toBe(resumeCommit);
      expect(await git(root, ["rev-parse", "refs/remotes/origin/v7"])).toBe(commit);
      const content = await git(root, ["show", "refs/remotes/origin/live-state:live-state/logs/123-1.log"]);
      expect(content).toContain("[REDACTED]");
      expect(content).not.toContain("secret-to-redact");
      const firstCheckpoint = JSON.parse(await git(root, ["show", "refs/remotes/origin/live-state:live-state/status.json"]));
      expect(firstCheckpoint).toMatchObject({ checkpoint_commit: commit, resume_commit: resumeCommit });
      await rm(join(root, "deploy/demo-state.json"));
      await restoreState(root);
      expect(JSON.parse(await readFile(join(root, "deploy/demo-state.json"), "utf8"))).toEqual(state);
      expect(await git(root, ["branch", "--show-current"])).toBe("v7");
      const before = await git(root, ["rev-parse", "origin/live-state"]);
      await persistState(root, "resume", 3, env);
      const after = await git(root, ["rev-parse", "origin/live-state"]);
      expect(after).not.toBe(before);
      expect(await git(root, ["rev-parse", `${after}^`])).toBe(before);
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 15_000);

  it("restores the matching release artifact when an earlier checkpoint omitted its filename", async () => {
    const { folder, root, remote, commit } = await repository();
    try {
      const env = keys();
      const recordName = "studionet-checkpoint.json";
      const savedRelease = release(commit);
      await writeFile(join(root, "deployments", recordName), JSON.stringify(savedRelease));
      await mkdir(join(root, "deploy"), { recursive: true });
      await writeFile(join(root, "deploy", "demo-state.json"), JSON.stringify({ deployment_artifact: `deployments/${recordName}`, completed_stages: ["r1"], steps: {} }));
      await mkdir(join(root, ".live-evidence/actions"), { recursive: true });
      await writeFile(join(root, ".live-evidence/v7-deployment-state.json"), JSON.stringify({ commit, contracts: savedRelease.contracts, transactions: {} }));
      await persistState(root, "resume", 75, env);

      const editor = join(folder, "editor");
      await git(folder, ["clone", remote, editor]);
      await git(editor, ["checkout", "-b", "live-state", "origin/live-state"]);
      await git(editor, ["config", "user.name", "Checkpoint test"]);
      await git(editor, ["config", "user.email", "tests@example.invalid"]);
      const statusPath = join(editor, "live-state", "status.json");
      const status = JSON.parse(await readFile(statusPath, "utf8"));
      status.release_record = null; // Simulate the earlier runner's lost filename while retaining its artifact.
      await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);
      await git(editor, ["add", "live-state/status.json"]);
      await git(editor, ["commit", "-m", "checkpoint without release filename"]);
      await git(editor, ["push", "origin", "live-state"]);

      await rm(join(root, "deployments", recordName), { force: true });
      await rm(join(root, ".live-evidence", "v7-deployment-state.json"), { force: true });
      await rm(join(root, "deploy", "demo-state.json"), { force: true });
      await restoreState(root);
      const checked = await checkPreconditions(root, env, false);
      expect(checked.release).toMatchObject({ path: `deployments/${recordName}`, record: { commit } });
      expect(checked.demo.deployment_artifact).toBe(`deployments/${recordName}`);
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 20_000);

  it("allows runner-only commits while preserving the checkpoint deployment", async () => {
    const { folder, root, commit } = await repository();
    try {
      const env = keys();
      await mkdir(join(root, ".live-evidence/actions"), { recursive: true });
      await writeFile(join(root, ".live-evidence/v7-deployment-state.json"), JSON.stringify({ commit, transactions: {} }));
      await writeFile(join(root, ".live-evidence/actions/restored-status.json"), JSON.stringify({ source_commit: commit }));
      const releasePath = "deployments/studionet-checkpoint.json";
      await writeFile(join(root, releasePath), JSON.stringify(release(commit)));
      await mkdir(join(root, "deploy"), { recursive: true });
      await writeFile(join(root, "deploy/demo-state.json"), JSON.stringify({ deployment_artifact: releasePath }));
      await mkdir(join(root, "web/scripts"), { recursive: true });
      await writeFile(join(root, "web/scripts/runner.mjs"), "runner-only change\n");
      await git(root, ["add", "web/scripts/runner.mjs"]);
      await git(root, ["commit", "-m", "runner-only change"]);
      const resumeCommit = await git(root, ["rev-parse", "HEAD"]);

      const result = await checkPreconditions(root, env, false);
      expect(result).toMatchObject({
        checkpoint_commit: commit,
        resume_commit: resumeCommit,
        release: { path: releasePath, record: { commit } },
      });
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 15_000);

  it("refuses a restored checkpoint when contract sources changed", async () => {
    const { folder, root, commit } = await repository();
    try {
      const env = keys();
      await mkdir(join(root, ".live-evidence/actions"), { recursive: true });
      await writeFile(join(root, ".live-evidence/actions/restored-status.json"), JSON.stringify({ source_commit: commit }));
      await writeFile(join(root, "contracts/AutonomousRepublic.py"), "changed contract source\n");
      await git(root, ["add", "contracts/AutonomousRepublic.py"]);
      await git(root, ["commit", "-m", "change contract"]);
      await expect(checkPreconditions(root, env, false)).rejects.toThrow("Checkpoint belongs to a different source commit; contract sources changed.");
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 15_000);

  it("selects this commit's V7 record and refuses ambiguous worlds", async () => {
    const { folder, root, commit } = await repository();
    try {
      await writeFile(join(root, "deployments/studionet-old.json"), JSON.stringify(release("old-commit")));
      await writeFile(join(root, "deployments/studionet-new.json"), JSON.stringify(release(commit)));
      expect((await selectRelease(root, commit)).path).toBe("deployments/studionet-new.json");
      await writeFile(join(root, "deployments/studionet-duplicate.json"), JSON.stringify(release(commit)));
      await expect(selectRelease(root, commit)).rejects.toThrow("Multiple V7 releases");
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 15_000);

  it("reports completion only after proof verification and labels stopped/resumable runs", () => {
    const demo = { completed_stages: ["r1"], current_game: { round_number: 2, phase: "REVEAL" }, steps: { one: { status: "ACCEPTED_PENDING_FINALITY" } }, stopped: { message: "wrong label" } };
    expect(summarize(demo, 0, false, "deploy").result).toBe("STOPPED");
    expect(summarize(demo, 0, true, "resume").result).toBe("COMPLETED");
    expect(summarize(demo, 75, false, "resume").result).toBe("RESUMABLE");
    expect(summarize(demo, 3, false, "resume").result).toBe("RESUMABLE");
    expect(summarize(demo, 2, false, "resume").result).toBe("STOPPED");
    expect(summarize(demo, 0, false, "check").result).toBe("CHECKED");
    expect(summarize(demo, 75, false, "resume").step_counts).toEqual({ ACCEPTED_PENDING_FINALITY: 1 });
    expect(summarize(demo, 75, false, "resume", { checkpoint_commit: "8c085ef", resume_commit: "a7381e5" })).toMatchObject({
      checkpoint_commit: "8c085ef",
      resume_commit: "a7381e5",
    });
  });
});
