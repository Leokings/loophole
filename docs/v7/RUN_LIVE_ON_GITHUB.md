# Run the V7 demo on GitHub

GitHub runs the release and keeps its progress on the `live-state` branch. Your
laptop can be off. Keep the PC task disabled and leave the production keeper
pointed at V6 throughout this run.

## 1. Make the workflow available

The implementation is on `v7`. GitHub also requires a `workflow_dispatch`
workflow to exist on the repository's default branch (`main`) before the Run
workflow button or CLI dispatch can work. **Pushing only `v7` does not register
this new workflow.**

**Registered on 2026-10-18 with owner approval:** commit `9b240ea` added only
`.github/workflows/live-release.yml` to `main`. GitHub now lists `live-release`
as active. The workflow explicitly checks out `v7`; the V7 application has not
been merged to `main`. No live-release job was started during registration.

Continue with the two secrets below, then select **v7** when running the
workflow's `check` and `deploy` modes.

[GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
document this prerequisite.

## 2. Add the two secrets

Use Node 22 locally. In this repository's `web` folder, run `npm ci` if the
dependencies are not installed, then run this **one command in a private terminal**:

```sh
node --input-type=module -e 'import {generatePrivateKey as key} from "genlayer-js"; console.log("GENLAYER_DEPLOYER_PRIVATE_KEY="+key()); console.log("V7_DEMO_WALLETS_JSON="+JSON.stringify(Object.fromEntries(["A","B","C","D"].map(s=>[s,{privateKey:key()}]))));'
```

It prints just two labelled values. The first is one throwaway deployer key; the
second is JSON containing four different throwaway demo keys. StudioNet is
gasless, so these accounts need no funds. Use these dedicated keys rather than
the production keeper key. Generate them once and keep the same secrets until
the run ends; replacing them breaks the seat identities needed to resume.

On GitHub, open **Leokings/loophole → Settings → Secrets and variables → Actions
→ New repository secret**. Create:

| Secret name | Paste as its value |
| --- | --- |
| `GENLAYER_DEPLOYER_PRIVATE_KEY` | Everything after the first `=` on the first line |
| `V7_DEMO_WALLETS_JSON` | Everything after the first `=` on the second line: the complete JSON object |

The workflow reads the keys from secrets and does not create a wallet key file.
Its saved public checkpoints are checked for key fields and the actual secret
values before any commit is made.

## 3. Check, then deploy

1. Open **Actions → live-release → Run workflow**.
2. Select branch **v7**, select mode **check**, and run it. Look for **CHECKED** in
   the job summary. This checks secrets, source identity, timings and restored
   state. It makes no StudioNet writes, writes no checkpoint branch, and queues
   no follow-up job.
3. Run the same workflow on **v7** with mode **deploy**. This starts a new V7
   world if this exact source commit has no release record. It runs the probe,
   deploys and links the three contracts, then starts the scenario.

The workflow uses commit/reveal windows of **1,200 / 600 seconds**. All other
timings use the reviewed defaults. Do not push more changes to `v7`, replace the
keys, manually advance this new world, or start a PC runner during the release.

Mode **resume** continues the saved deployment/demo; it does not create a fresh
world when no deployment checkpoint exists. The deploy script still requires a
clean source tree and pushed HEAD. Only untracked generated StudioNet release
records are allowed as an extra CI file; changed source is still rejected.

## 4. Let the jobs continue

Each job has a 350-minute limit. The runner uses a 300-minute soft limit and can
pause earlier to reserve time for the next round's attached court stages. It
pauses after the current round's moves and attached stages, before advancing the
world, or during the final fallback wait. It never deliberately opens a fresh
commit window and then pauses before sending that round's reveals.

A 320-minute step timeout leaves room for the final checkpoint if a network call
hangs; proof verification has its own 15-minute limit. A timed-out step stops for
review instead of silently discarding the recorded transaction hashes.

Every job summary shows completed stages, the latest recorded round and phase,
step counts by status, and any pause or stop message. Outcomes are:

| Outcome | What happens |
| --- | --- |
| **CHECKED** | Setup is valid; start `deploy` yourself. |
| **RESUMABLE**, exit 75 (`PAUSED_SAFE`) | State and logs are saved, then another `resume` job is queued. |
| **RESUMABLE**, exit 3 | RPC retries were exhausted; saved hashes are retained and another job is queued. A missed round window on restart becomes a stop. |
| **STOPPED**, exit 2 | A judgment, guard, influence check or missed window broke the scripted story. No automatic continuation. Bring the result to Claude. |
| **STOPPED**, exit 1 | Setup, persistence, proof or another unexpected error needs review. No automatic continuation. |
| **COMPLETED** | The scenario and finality sweep finished, proof was assembled, and its read-only verification passed. |

The runner retries transient RPC failures six times with increasing waits. It
reuses existing transaction hashes on resume, rather than inventing replacement
moves. If a job is cancelled or times out, inspect the saved state and summary
before manually using `resume`; a missed scripted window requires a new world.
If restoration or checkpoint persistence fails, no next job is queued.

Execution-slot congestion (`Server busy: all 8 execution slots occupied, retry
later`) is also transient, even when StudioNet returns HTTP 200 with JSON-RPC
code `-32600`. The runner retries that specific response with the identical
request; it does not retry every protocol error. Retry messages contain only
the attempt number and wait time. Exhaustion exits 3 for checkpoint/resume.
Unexpected judgments and scenario guards still stop immediately.

A READY round does not freeze court deadlines. A case still in BRIEFING after
`brief_deadline + resolution_seconds` cannot be resolved by the reviewed story.
Preserve such an attempt and start a new world; do not clear its stop marker,
edit its receipts, or change the deployed deadline to pretend it completed.

GitHub concurrency allows one active live-release job. A queued continuation uses
`GITHUB_TOKEN` with `actions: write`; GitHub explicitly permits
[workflow-dispatch events from workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
Continuations are separate GitHub jobs and count toward the repository's Actions
usage.

## 5. Bring the saved evidence for review

When the summary says **COMPLETED** or **STOPPED**, say **“review phase 5b”** and
point Claude to the `live-state` branch:

- `live-state/status.json`: outcome, completed stages, source commit and counts.
- `live-state/deploy-state.json` and `live-state/demo-state.json`: checkpoints.
- `live-state/studionet-*.json` and `deployments/studionet-*.json`: the release record.
- `live-state/logs/`: a log for each job.
- `deploy/proof.json` and `web/public/proof.json`: present once proof verification
  succeeds, with identical contents.

These results stay on `live-state` for review. The workflow does not merge them
to `v7`, change Vercel, switch the keeper, or submit anything to the Portal.
`deployments/abandoned/` and the Phase 5B report preserve the earlier attempts;
they are not the completed release.
