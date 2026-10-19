#!/usr/bin/env node
/** Allowlisted GitHub checkpoint I/O. No key files are ever copied or committed. */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createAccount } from "genlayer-js";
import { projectRoot } from "./deployment-shared.mjs";
import { assertReleaseBranch } from "./deploy-loophole.mjs";
import { load, loadWallets } from "./run-v7-demo.mjs";
import { releaseTimings } from "./v7-release-guards.mjs";
import { exitCodeFor } from "./v7-runner-runtime.mjs";

const exec = promisify(execFile);
const actionsPath = (root, name) => resolve(root, ".live-evidence/actions", name);
const releaseName = /^studionet-[\w.-]+\.json$/;

async function git(root, args, extra = {}) {
  return (await exec("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024, ...extra })).stdout.trimEnd();
}
async function assertCheckpointContractsUnchanged(root, checkpointCommit, resumeCommit) {
  if (checkpointCommit === resumeCommit) return;
  try {
    await git(root, ["diff", "--quiet", checkpointCommit, "HEAD", "--", "contracts/"]);
  } catch (error) {
    if (error.code === 1) throw new Error("Checkpoint belongs to a different source commit; contract sources changed. Preserve it for owner review.");
    throw new Error("Could not verify checkpoint contract sources; preserve it for owner review.");
  }
}
function checkpointCommitFor(restored, deployment, resumeCommit) {
  return deployment?.commit || restored?.checkpoint_commit || restored?.source_commit || restored?.resume_commit || resumeCommit;
}
async function write(root, path, data) {
  const target = resolve(root, path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, data, { mode: 0o600 });
}
function secretValues(env) {
  let wallets = {};
  try { wallets = JSON.parse(env.V7_DEMO_WALLETS_JSON || "{}"); } catch { /* Validation reports a value-free error. */ }
  return [env.GENLAYER_DEPLOYER_PRIVATE_KEY, env.V7_DEMO_WALLETS_JSON, ...Object.values(wallets).map((item) => item?.privateKey)].filter(Boolean);
}
export function assertNoSecrets(data, env = process.env) {
  if (/"privateKey"\s*:/i.test(data) || secretValues(env).some((key) => data.includes(key))) {
    throw new Error("Checkpoint rejected: private key material detected. Nothing was committed.");
  }
}
function maskSecrets(env) {
  if (env.GITHUB_ACTIONS === "true") for (const value of secretValues(env)) {
    console.log(`::add-mask::${String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}`);
  }
}

export async function selectRelease(root, commit) {
  const files = await readdir(resolve(root, "deployments")).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
  const candidates = [];
  for (const name of files.filter((name) => releaseName.test(name))) {
    const record = await load(resolve(root, "deployments", name), null);
    if (record?.version === 1 && record.network === "studionet" && record.commit === commit && record.contracts?.caseLaw && record.contracts?.republic && record.contracts?.court) candidates.push({ path: `deployments/${name}`, record });
  }
  if (candidates.length > 1) throw new Error("Multiple V7 releases exist for this commit; owner review must choose the world.");
  return candidates[0] || null;
}

export async function restoreState(root = projectRoot) {
  try { await git(root, ["ls-remote", "--exit-code", "--heads", "origin", "refs/heads/live-state"]); }
  catch (error) { if (error.code === 2) { console.log("No live-state branch yet; starting with empty checkpoints."); return; } throw error; }
  await git(root, ["fetch", "--no-tags", "origin", "live-state:refs/remotes/origin/live-state"]);
  const ref = "refs/remotes/origin/live-state";
  const names = new Set((await git(root, ["ls-tree", "-r", "--name-only", ref])).split("\n"));
  const mapping = {
    "live-state/deploy-state.json": ".live-evidence/v7-deployment-state.json",
    "live-state/demo-state.json": "deploy/demo-state.json",
    "live-state/status.json": ".live-evidence/actions/restored-status.json",
    "deploy/proof.json": ".live-evidence/actions/restored-proof.json",
  };
  if (names.has("live-state/status.json")) {
    const status = JSON.parse(await git(root, ["show", `${ref}:live-state/status.json`]));
    if (status.release_record) {
      if (!releaseName.test(status.release_record)) throw new Error("Invalid checkpoint release filename.");
      mapping[`live-state/${status.release_record}`] = `deployments/${status.release_record}`;
    }
  }
  for (const [source, destination] of Object.entries(mapping)) if (names.has(source)) {
    const data = `${await git(root, ["show", `${ref}:${source}`])}\n`;
    assertNoSecrets(data);
    JSON.parse(data);
    await write(root, destination, data);
  }
  console.log("Restored the allowlisted deployment and demo checkpoints.");
}

export async function checkPreconditions(root = projectRoot, env = process.env, checkBranch = true) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(env.GENLAYER_DEPLOYER_PRIVATE_KEY || "")) throw new Error("Missing or invalid GENLAYER_DEPLOYER_PRIVATE_KEY repository secret.");
  if (!env.V7_DEMO_WALLETS_JSON) throw new Error("Missing V7_DEMO_WALLETS_JSON repository secret.");
  const wallets = await loadWallets(env);
  let deployer;
  try { deployer = createAccount(env.GENLAYER_DEPLOYER_PRIVATE_KEY).address.toLowerCase(); }
  catch { throw new Error("Invalid throwaway deployer key."); }
  if (Object.values(wallets).some((wallet) => createAccount(wallet.privateKey).address.toLowerCase() === deployer)) throw new Error("The deployer must use a separate key from all four demo seats.");
  const timing = releaseTimings(env);
  if (timing.commitSeconds !== 1200 || timing.revealSeconds !== 600 || env.LOOPHOLE_REPUBLIC_ID !== "LOOPHOLE-STUDIONET-V7") throw new Error("CI requires V7 republic id and 1200/600 second windows.");
  if (checkBranch) await assertReleaseBranch();
  const commit = await git(root, ["rev-parse", "HEAD"]);
  const restored = await load(actionsPath(root, "restored-status.json"), null);
  const deployment = await load(resolve(root, ".live-evidence/v7-deployment-state.json"), null);
  const demo = await load(resolve(root, "deploy/demo-state.json"), null);
  const checkpointCommit = checkpointCommitFor(restored, deployment, commit);
  const checkpointCommits = new Set([restored?.source_commit, restored?.checkpoint_commit, restored?.resume_commit, deployment?.commit].filter(Boolean));
  for (const sourceCommit of checkpointCommits) {
    if (typeof sourceCommit !== "string" || !/^[a-f0-9]{7,40}$/i.test(sourceCommit)) throw new Error("Checkpoint contains an invalid source commit; preserve it for owner review.");
    await assertCheckpointContractsUnchanged(root, sourceCommit, commit);
  }
  const releaseCommit = deployment?.commit || checkpointCommit;
  const release = await selectRelease(root, releaseCommit);
  if (release && (release.record.constructor_args?.commitSeconds !== timing.commitSeconds || release.record.constructor_args?.revealSeconds !== timing.revealSeconds)) throw new Error("Restored release timing differs from the reviewed CI timing.");
  if (demo && (!release || demo.deployment_artifact !== release.path)) throw new Error("Demo checkpoint belongs to another deployment record.");
  console.log("CHECKED: branch, pushed HEAD, secrets, timing and restored-state identity.");
  return { commit, checkpoint_commit: checkpointCommit, resume_commit: commit, release, deployment, demo };
}

async function command(root, binary, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(binary, args, { cwd: resolve(root, "web"), stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) => done(code ?? 1));
  });
}

export async function executeLive(mode, root = projectRoot) {
  if (!["check", "deploy", "resume"].includes(mode)) throw new Error("Mode must be check, deploy or resume.");
  const checked = await checkPreconditions(root);
  if (mode === "check") return 0;
  if ([1, 2].includes(checked.demo?.stopped?.exit_code)) throw new Error("The previous run stopped on an unexpected result. Owner review is required; no automatic resume.");
  let release = checked.release;
  if (!release) {
    if (mode === "resume" && !checked.deployment) throw new Error("No saved deployment exists. Run check, then deploy, to start a new release.");
    if (mode === "resume") throw new Error("The saved deployment record could not be matched; refusing to redeploy during resume.");
    const code = await command(root, process.execPath, ["scripts/deploy-loophole.mjs", "studionet"]);
    if (code !== 0) return code;
    release = await selectRelease(root, checked.commit);
    if (!release) throw new Error("Deployment finished without a matching V7 release record.");
  }
  await write(root, ".live-evidence/actions/release-path", release.path);
  return command(root, process.execPath, ["scripts/run-v7-demo.mjs", release.path, "--confirm-live-studionet", "--max-runtime-minutes", "300"]);
}

async function proof(root) {
  const restored = await load(actionsPath(root, "restored-proof.json"), null);
  const commit = await git(root, ["rev-parse", "HEAD"]);
  const path = (await readFile(actionsPath(root, "release-path"), "utf8")).trim();
  if (restored?.commit === commit) {
    const data = `${JSON.stringify(restored, null, 2)}\n`;
    await write(root, "deploy/proof.json", data);
    await write(root, "web/public/proof.json", data);
  } else {
    const assembled = await command(root, process.execPath, ["scripts/assemble-proof.mjs", path]);
    if (assembled !== 0) return assembled;
  }
  const verified = await command(root, process.execPath, ["--import", "./scripts/v7-rpc-retries.mjs", "scripts/verify-proof.mjs"]);
  if (verified === 0) await write(root, ".live-evidence/actions/proof-verified", "true\n");
  return verified;
}

export function summarize(demo, code, proofVerified, mode, commits = {}) {
  const counts = {};
  for (const step of Object.values(demo?.steps || {})) counts[step.status] = (counts[step.status] || 0) + 1;
  return {
    result: mode === "check" && code === 0 ? "CHECKED" : code === 0 && proofVerified ? "COMPLETED" : [3, 75].includes(code) ? "RESUMABLE" : "STOPPED",
    exit_code: code, mode, completed_stages: demo?.completed_stages || [],
    current_game: demo?.current_game || null, step_counts: counts,
    checkpoint_commit: commits.checkpoint_commit || null,
    resume_commit: commits.resume_commit || null,
    stopped: demo?.stopped || null, paused: demo?.paused || null, proof_verified: proofVerified,
  };
}

async function statusFor(root, mode, code, env = process.env) {
  const demo = await load(resolve(root, "deploy/demo-state.json"), null);
  const verified = await readFile(actionsPath(root, "proof-verified"), "utf8").then(() => true).catch(() => false);
  const resumeCommit = await git(root, ["rev-parse", "HEAD"]);
  const restored = await load(actionsPath(root, "restored-status.json"), null);
  const deployment = await load(resolve(root, ".live-evidence/v7-deployment-state.json"), null);
  const checkpointCommit = checkpointCommitFor(restored, deployment, resumeCommit);
  return {
    ...summarize(demo, code, verified, mode, { checkpoint_commit: checkpointCommit, resume_commit: resumeCommit }),
    source_commit: resumeCommit,
    checkpoint_commit: checkpointCommit,
    resume_commit: resumeCommit,
    run_id: env.GITHUB_RUN_ID || "local",
    at: new Date().toISOString(),
  };
}

async function gitInput(root, args, input, env) {
  return new Promise((done, reject) => {
    const child = spawn("git", args, { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? done(stdout.trim()) : reject(new Error(`Checkpoint git ${args[0]} failed; state was not dispatched.`)));
    child.stdin.end(input);
  });
}

export async function persistState(root, mode, code, env = process.env) {
  const status = await statusFor(root, mode, code, env);
  const deployment = await load(resolve(root, ".live-evidence/v7-deployment-state.json"), null);
  const release = await selectRelease(root, deployment?.commit || status.checkpoint_commit || status.source_commit);
  status.release_record = release ? basename(release.path) : null;
  const files = new Map([["live-state/status.json", `${JSON.stringify(status, null, 2)}\n`]]);
  for (const [source, target] of [
    [".live-evidence/v7-deployment-state.json", "live-state/deploy-state.json"],
    ["deploy/demo-state.json", "live-state/demo-state.json"],
  ]) {
    const data = await readFile(resolve(root, source), "utf8").catch((error) => { if (error.code === "ENOENT") return null; throw error; });
    if (data) files.set(target, data);
  }
  if (release) {
    const data = await readFile(resolve(root, release.path), "utf8");
    files.set(`live-state/${basename(release.path)}`, data);
    files.set(release.path, data);
  }
  if (status.proof_verified) for (const path of ["deploy/proof.json", "web/public/proof.json"]) files.set(path, await readFile(resolve(root, path), "utf8"));
  const log = await readFile(actionsPath(root, "run.log"), "utf8").catch(() => "No runner log; consult the job setup summary.\n");
  let redacted = log;
  for (const key of secretValues(env)) redacted = redacted.split(key).join("[REDACTED]");
  files.set(`live-state/logs/${status.run_id}-${env.GITHUB_RUN_ATTEMPT || "1"}.log`, redacted);
  for (const data of files.values()) assertNoSecrets(data, env);

  let parent = null;
  let branchExists = true;
  try { await git(root, ["ls-remote", "--exit-code", "--heads", "origin", "refs/heads/live-state"]); }
  catch (error) { if (error.code === 2) branchExists = false; else throw error; }
  if (branchExists) {
    await git(root, ["fetch", "--no-tags", "origin", "live-state:refs/remotes/origin/live-state"]);
    parent = await git(root, ["rev-parse", "refs/remotes/origin/live-state"]);
  }
  const index = actionsPath(root, "checkpoint-index");
  await mkdir(resolve(index, ".."), { recursive: true });
  const gitEnv = { ...env, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: "Loophole live release", GIT_AUTHOR_EMAIL: "live-release@users.noreply.github.com", GIT_COMMITTER_NAME: "Loophole live release", GIT_COMMITTER_EMAIL: "live-release@users.noreply.github.com" };
  await git(root, ["read-tree", ...(parent ? [parent] : ["--empty"])], { env: gitEnv });
  for (const [path, data] of files) {
    const blob = await gitInput(root, ["hash-object", "-w", "--stdin"], data, gitEnv);
    await git(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`], { env: gitEnv });
  }
  const tree = await git(root, ["write-tree"], { env: gitEnv });
  const commit = await gitInput(root, ["commit-tree", tree, ...(parent ? ["-p", parent] : [])], `V7 live checkpoint ${status.run_id}: ${status.result}\n`, gitEnv);
  await git(root, ["push", "origin", `${commit}:refs/heads/live-state`]);
  console.log(`Saved ${files.size} allowlisted files to live-state (${status.result}).`);
}

async function main() {
  const [action, mode = "resume", code = "1"] = process.argv.slice(2);
  if (action === "mask") return maskSecrets(process.env);
  if (action === "restore") return restoreState();
  if (action === "execute") { process.exitCode = await executeLive(mode); return; }
  if (action === "proof") { process.exitCode = await proof(projectRoot); return; }
  if (action === "persist") return persistState(projectRoot, mode, Number(code));
  if (action === "summary") {
    const status = await statusFor(projectRoot, mode, Number(code));
    const text = `## live-release: ${status.result}\n\nCheckpoint commit: ${status.checkpoint_commit}\n\nResume commit: ${status.resume_commit}\n\nCompleted stages: ${status.completed_stages.join(", ") || "none"}\n\nCurrent round/phase: ${status.current_game ? `${status.current_game.round_number} / ${status.current_game.phase}` : "not reached"}\n\nStep counts: ${JSON.stringify(status.step_counts)}\n\nStop: ${status.stopped?.message || status.paused?.location || (status.result === "STOPPED" ? "See setup, deployment or proof logs." : "none")}\n\nProof verified: ${status.proof_verified}\n`;
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, text, { flag: "a" });
    else console.log(text);
    return;
  }
  throw new Error("Usage: live-release-state.mjs restore|execute|proof|persist|summary [mode] [exit-code]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Live release setup failed.");
  process.exitCode = exitCodeFor(error);
});
