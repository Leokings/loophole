# Handoff — run the V7 live release on GitHub Actions instead of the owner's PC

Written by Claude on 2026-10-18 for Codex. The owner wants the live run off their PC and has asked Codex to build this. Work on branch `v7`. Commit each work package (WP) separately. **Pushing `v7` is approved for this handoff**, because the workflow must exist on GitHub to run. Do not touch Vercel, the keeper or the Portal.

## Where things stand

| Item | State |
| --- | --- |
| Contracts | Accepted by StudioNet's schema check (Republic 36 methods, Court 13, CaseLaw 6, probe 2). Commit `a59c069` fixed the probe header and added `.gitattributes` (`*.py eol=lf`). |
| Deploy script | **Works live.** It deployed twice on 2026-10-18 with every transaction `FINALIZED_SUCCESS`. |
| Demo runner | **Works live through rounds 1–3** (attempt 2). Law 1 "Good Faith Act" → `UNADJUDICABLE`. Law 2 "Officeholder Protection" → `ADJUDICABLE` and enacted 3–0. Offices as planned. The early-fallback refusal was recorded. |
| Attempt 1 (abandoned) | Republic `0x0d763952e28ad6ea67535fE1646c1DB46f65008F`, CaseLaw `0xF2b831B05dB4ea3c495463CdF0E6e604D0349117`, Court `0x5133989b6c628189739AA184B399D99f9525189D`. A V6 setting in `web/.env.local` (commit 300 s) closed round 1 before the demo could commit, and then a StudioNet 503 stopped the runner. |
| Attempt 2 (abandoned) | Republic `0x25D1B1aD6bf0650dDBe5ed97e47136D387FB57B9`, CaseLaw `0xcEE1A3c08Af32B28387619Ef9FFc86f8184A8D80`, Court `0x359dAdfa71061a637d1d7A232FdF4a5fDC5A0234` (commit `a59c069`, commit/reveal 1200/600 s). It completed r1–r3, then **Windows `EPERM` on renaming `demo-state.json.tmp`** stopped the runner. Round 4's commit window passed with no moves, and the scripted story can't continue there. The world is parked at round 4 `READY_TO_ADVANCE`. Its records are on the owner's PC in `C:\Users\leoki\Genlayer\loophole-live\abandoned-attempt2\` and `deployments/studionet-2026-10-18T04-48-26.345Z.json`. **Commit that JSON file** under `deployments/abandoned/` so the history is complete. |
| Local scheduler | Disabled. Don't use it. |

Record both abandoned attempts honestly in the Phase 5B report (addresses, cause, what they proved: attempt 2 is live evidence for certification, enactment and elections).

## WP-L1 — Runner robustness (`web/scripts/run-v7-demo.mjs`, `web/scripts/v7-demo-scenario.mjs`)

1. **Atomic save with retry.** In `save()`, retry `rename(tmp, path)` up to 10 times with 250 ms × attempt backoff on `EPERM` / `EBUSY` / `EACCES`. If it still fails, write the file directly (non-atomic) and log a warning. Never throw out of `save()` for those codes.

2. **Resume mid-round.** `play()` currently always waits for `COMMIT` first, so a resume after the commit window hangs or misses the round. Make it phase-aware, using the recorded steps for that round:

| Current phase | State recorded for this round | What `play()` does |
| --- | --- | --- |
| `COMMIT` | — | do whatever commits are missing |
| `REVEAL` | all commits recorded | skip commits; do whatever reveals are missing |
| `READY_TO_ADVANCE` | all reveals recorded | skip to the attached stages and `advance_round` |
| any phase | the window it needed has passed with its moves missing | **stop** with `ScenarioStopError("Round N window missed; scripted story cannot continue — redeploy")` |

   Never call `advance_round` with scripted seats missing. Resubmitting a recorded step must reuse its stored `tx_hash`, which `executeStep` already does.

3. **Safe pause (`--max-runtime-minutes N`).** When the runtime is exceeded, the runner may pause **only** at a safe point:
   - inside `play()` after the attached `beforeAdvance` stages and **before** `advance_round`, while the world is at `READY_TO_ADVANCE`, where waiting costs nothing
   - or between stages
   It saves state and exits with **code 75**, printing `PAUSED_SAFE`. It must never pause between `advance_round` and that round's reveals. The final fallback stage's 3-hour wait counts as a safe point: pause during the wait and resume later.

4. **Transient errors.** Inside the runner, retry RPC reads and the submit/poll of writes on transient errors (HTTP 429/502/503/504, "temporarily unavailable", "resource not available", `ECONNRESET`, `ETIMEDOUT`, `fetch failed`) up to 6 times with 15 s × attempt backoff. Scenario checks must still stop immediately.

5. **Exit codes:** `0` = completed; `75` = paused safely (resumable); `3` = transient failure after retries (resumable); `2` = `ScenarioStopError` (**do not resume**); `1` = anything else.

6. **Environment overrides for CI:**
   - Wallets come from env `V7_DEMO_WALLETS_JSON` (`{"A":{"privateKey":"0x…"},"B":…,"C":…,"D":…}`). When it is set, never write wallet keys to disk.
   - Timings come from env as today.

**Tests (vitest, mocked):**
- save retry on `EPERM`
- resume from each phase (`COMMIT` / `REVEAL` / `READY` with partial steps)
- missed window → stop with code 2
- `--max-runtime-minutes` pauses only at READY or between stages, and never after an advance before reveals
- transient read retried, scenario stop not retried

## WP-L2 — GitHub Actions workflow `.github/workflows/live-release.yml`

- **Triggers:** `workflow_dispatch` only, with input `mode` = `deploy` | `resume`, default `resume`.
- **Settings:** `concurrency: { group: live-release, cancel-in-progress: false }`, `timeout-minutes: 350`, `permissions: { contents: write, actions: write }`.
- **Job steps:**
  1. Check out `v7`, set up Node 22 and Python 3.12, run `npm ci` in `web/`.
  2. **Restore state** from branch `live-state`, folder `live-state/`:
     - `deploy-state.json`, which goes to `.live-evidence/v7-deployment-state.json`
     - `demo-state.json`, which goes to `deploy/demo-state.json`
     - the newest V7 release record, which goes to `deployments/`
     If the branch doesn't exist, start empty.
  3. **Environment:**
     - `GENLAYER_DEPLOYER_PRIVATE_KEY: ${{ secrets.GENLAYER_DEPLOYER_PRIVATE_KEY }}`
     - `V7_DEMO_WALLETS_JSON: ${{ secrets.V7_DEMO_WALLETS_JSON }}`
     - `LOOPHOLE_COMMIT_SECONDS=1200`, `LOOPHOLE_REVEAL_SECONDS=600`, `LOOPHOLE_REPUBLIC_ID=LOOPHOLE-STUDIONET-V7`, all other timings at their defaults
     - **Never echo secrets.** Mask them with `::add-mask::` if any step prints derived values.
  4. **If `mode == deploy` and no release record for this commit exists:** run `npm run deploy:studionet`. The deploy script's clean-tree and pushed-HEAD checks must still pass in CI. Restored state files are git-ignored, except the `deployments/` record; place it *after* the deploy check, or update the clean-tree check to ignore untracked `deployments/studionet-*.json` in CI only.
  5. Run `node --env-file-if-exists=.env.local scripts/run-v7-demo.mjs <record> --confirm-live-studionet --max-runtime-minutes 300`. Capture the exit code.
  6. **Always**, with `if: always()`: commit the state files and the run log to branch `live-state` under `live-state/` (force-create the branch if missing). The demo state has no private keys; double-check that with a grep for `privateKey` before committing.
  7. **On exit code 75 or 3:** run `gh workflow run live-release.yml --ref v7 -f mode=resume`. `GITHUB_TOKEN` is allowed to dispatch `workflow_dispatch`. This chains jobs until done.
  8. **On exit code 0:** run `npm run proof:assemble -- <record>` and `npm run verify:proof`, then commit `deploy/proof.json`, `web/public/proof.json` and the release record to `live-state`. **Don't** push them to `v7`; Claude reviews first.
  9. **On exit code 2 or 1:** don't re-dispatch. Write a job summary (`$GITHUB_STEP_SUMMARY`) with the stop stage and message.
- **Job summary every run:** completed stages, the current round and phase, and the step counts by status.

**Tests:** `actionlint` (or a YAML parse) in local verification, plus a dry-run mode (`mode=check`) that does everything except network writes: preconditions, secret presence, state restore.

## WP-L3 — Owner instructions (`docs/v7/RUN_LIVE_ON_GITHUB.md`)
Short steps the owner follows:
1. Add two repository secrets: Settings → Secrets and variables → Actions → New repository secret.
   - `GENLAYER_DEPLOYER_PRIVATE_KEY`: a throwaway key. StudioNet is gasless, so it needs no funds.
   - `V7_DEMO_WALLETS_JSON`: four throwaway keys in the JSON shape above. Provide a one-line `node` command that generates both values locally without printing anything else.
2. Actions → "live-release" → Run workflow → `mode=check`, then `mode=deploy`.
3. Watch the job summaries. The run chains itself until `COMPLETED` or a stop.
4. Then bring the `live-state` branch results to Claude: "review phase 5b".

## Verification before pushing
- `python scripts/verify.py --integration`
- `npm run check` in `web/`
- the new runner tests

Then push `v7` and report the commit list. **Do not start the workflow yourself**; the owner adds the secrets and starts it.
