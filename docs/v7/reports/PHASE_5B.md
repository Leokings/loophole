# Phase 5B report — abandoned attempts and GitHub runner handoff

## Summary

WP-L1 through WP-L3 are implemented on `v7`. The runner saves checkpoints with
rename retries, resumes recorded commit/reveal transactions, rejects missed
windows, pauses only at safe boundaries, and retries identical transient RPC
requests. A manual GitHub workflow restores and saves public state on
`live-state`, chains resumable jobs, and assembles/verifies proof after the demo.

No workflow was dispatched as part of this implementation. The new GitHub path
has local mocked, YAML and local-Git coverage; it has not been exercised on
GitHub's runners or used for a new StudioNet deployment.

## Work packages

| WP | Commit | Status | Notes |
| --- | --- | --- | --- |
| L1 | `361bb9f` | done locally | Serialized atomic saves, ten rename retries and direct-write fallback; phase-aware `play`, frozen action/nonces, idempotent influence settlement, safe runtime pauses and fallback-wait resume; six transient RPC retries using identical request bytes; exit codes 0/75/3/2/1; environment wallets stay in memory. |
| Live history | `e188ce9` | done | Committed the supplied attempt-2 deployment record unchanged under `deployments/abandoned/`. |
| L2 | `63cb9e2` | done locally; activation pending | Manual check/deploy/resume workflow, concurrency lock, 350-minute job limit, 300-minute runner budget, 320-minute runner-step and 15-minute proof-step cutoffs to leave checkpoint time, Node 22/Python 3.12, allowlisted checkpoint restore/persistence, public summaries/logs, proof verification, and continuation only after successful checkpoint push for exits 75/3. |
| L3 | this commit | done | `RUN_LIVE_ON_GITHUB.md` contains secret generation, setup and start steps, status meanings, evidence paths and the GitHub default-branch prerequisite. The original handoff is committed with these docs. |

## Tests

- `python scripts/verify.py --integration` — passed: all three contracts lint,
  validate and typecheck; **99 direct tests**, **2 five-validator GLSim tests**,
  web checks below, **5 scheduler tests**, and scheduler dry-run deployment.
  Final line: `Loophole verification passed.`
- `npm run check` in `web/` — passed separately: ESLint, TypeScript,
  **79 tests across 13 files**, and optimized Next.js production build.
- The targeted runner/checkpoint suites passed **34 tests across 3 files**.
- `test_live_release_workflow_has_manual_gates_and_safe_chaining` parses the
  YAML and checks triggers, modes, permissions, timeout, checkpoint conditions
  and the exit-code continuation gate. It runs in the direct-test suite and CI.

New runner coverage includes EPERM retries, busy-rename fallback, serialized
saves, partial COMMIT/REVEAL/READY resumes, missed-window exit 2, reconciliation of
pending recorded hashes, influence reconciliation after an advance, safe pauses
after attached stages and between stages, no pause after an advance before the
next reveals, fallback-wait resume, transient retries without retrying scenario
failures, same-payload write retries, saved-hash reuse, environment-only wallets
and runtime/exit classification.

New checkpoint coverage includes the CI-only untracked-release exception,
secret rejection, creation and update of a checkpoint branch against a **local
bare Git remote**, restore round trips with `v7` unchanged, setup/state-identity
checks without live RPC, release selection/ambiguity refusal and accurate
completion/stop/resume summaries. These Git tests do not contact GitHub.

## Abandoned live attempts

Both attempts below predate this handoff implementation. Neither is a completed
V7 proof. Source: the supplied handoff, the attempt-2 deployment JSON and the
owner's separately archived attempt-2 demo checkpoint. No historical receipt was
independently re-polled during this implementation.

### Attempt 1 — abandoned on 2026-10-18

- Republic: `0x0d763952e28ad6ea67535fE1646c1DB46f65008F`
- CaseLaw: `0xF2b831B05dB4ea3c495463CdF0E6e604D0349117`
- Court: `0x5133989b6c628189739AA184B399D99f9525189D`
- Cause recorded by the handoff: a stale V6 300-second commit override closed
  the first round's commit window, then a StudioNet 503 stopped the runner.
- Scope: the handoff reports successful finalized deployments; no complete
  scripted round or binding-precedent result is claimed for this world.

### Attempt 2 — abandoned on 2026-10-18

- Republic: `0x25D1B1aD6bf0650dDBe5ed97e47136D387FB57B9`
- CaseLaw: `0xcEE1A3c08Af32B28387619Ef9FFc86f8184A8D80`
- Court: `0x359dAdfa71061a637d1d7A232FdF4a5fDC5A0234`
- Deployment source: `a59c069397ae5ddf6513ba533c91fcb7d9619f88`, 1200/600-second
  commit/reveal windows. Record:
  [`studionet-2026-10-18T04-48-26.345Z.json`](../../../deployments/abandoned/studionet-2026-10-18T04-48-26.345Z.json).
- Cause: Windows `EPERM` renaming `demo-state.json.tmp` stopped checkpointing
  after r3. The following r4 commit window passed with no scripted moves.
- The archived demo state lists `claims`, `r1`, `r2`, `r3` as completed. It records
  both `certify:vague` and `certify:rule` as `FINALIZED_SUCCESS`, plus the
  early-fallback guard as `FINALIZED_EXPECTED_FAILURE`.
- The recorded r3 read-back shows law 1 `UNADJUDICABLE`, law 2 `ADJUDICABLE` and
  `ENACTED` with support 3 / oppose 0, and round 4 opened. The handoff also
  records the planned election outcome. These are partial live observations,
  not mocked data, but the archived r3 advance remains
  `ACCEPTED_PENDING_FINALITY`. A complete finalized r1–r3 transaction manifest
  must not be inferred from the read-back alone.
- No case-law safe harbor, summary disposition, amendment-closing demonstration
  or final verified V7 proof is claimed for this abandoned world.

## Deviations from the handoff

| Section | Requested | Implemented / reason |
| --- | --- | --- |
| Workflow modes | Trigger initially lists deploy/resume; tests and owner steps require check. | Added `check` to the mode choice alongside deploy/resume, default resume. Check never performs chain writes, checkpoint pushes or dispatches. |
| GitHub activation | Push v7, then Run workflow. | GitHub requires the workflow on the default branch before manual dispatch. The repository's default is `main`; only `v7` push is authorized. The owner guide records the needed separately approved copy of the workflow file to `main`. No main merge, default-branch change or dispatch was performed. |
| Safe runtime | Pause after the runtime budget. | Also pauses early at the same READY boundary when the next round needs a reserve: 210 minutes before r6, 90 before r7, 40 otherwise. This reduces the risk of opening a window just before the 350-minute job cap. Unexpectedly long network operations may still exhaust a job; persisted state is retained for review. |
| Always save state | Always persist at job end. | The persist step uses `always()` after successful restore. It refuses to replace checkpoint history after failed restore or secret detection; continuation is gated on a successful checkpoint push. |
| Submission retries | Retry transient submit failures. | Retry the identical low-level RPC payload rather than invoking a fresh SDK write with a new nonce. This preserves the request's identity after a lost response. |

## Risk notes and remaining work

- GitHub activation and the two repository secrets remain owner steps. The
  workflow itself and `mode=check` were not dispatched here.
- The PC scheduler was described as disabled in the handoff; it was not used.
  The production V6 keeper, Vercel settings and Portal were not changed.
- A missed scripted window exits 2 and does not manufacture AI moves or start a
  replacement world. An unexpected judgment also stops automatic continuation.
- `live-state` is public evidence/checkpoint storage. Wallet keys are excluded
  and scanned; frozen actions and commit/reveal nonces are part of demo state.
- The save fallback handles the reported rename-lock failure. A genuinely
  unwritable filesystem still must fail rather than pretend that a transaction
  hash was durably recorded.
- Both archived attempts remain historical. The GitHub run must produce a new
  completed scenario and verified manifest before publication or keeper changes.
- The full human-wallet browser path and organic AI-seat litigation are still
  separate evidence work. The workflow does not claim either was tested.

## Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Technical readiness | PASS for local implementation; launch prerequisite pending | Required checks pass, including mocked recovery and local Git checkpoint tests. The workflow needs default-branch registration and owner-supplied secrets before its first GitHub run. |
| Distinctiveness | Not re-evaluated by this operations handoff | Contracts and the reviewed V7 mechanism are unchanged. Final cohort/project comparison remains Claude's Phase 5B review. |
| Evidence readiness | FAIL for a completed V7 release | Two explicitly abandoned historical worlds; no newly executed GitHub demo or verified final public V7 proof from this handoff. |

## Workflow registration — 2026-10-18

After the owner approved the default-branch prerequisite, commit `9b240ea`
added **only** `.github/workflows/live-release.yml` to `main`. Its Git blob
matches the tested workflow on `v7`. The YAML/trigger check and the targeted
workflow test passed. GitHub's API confirms `live-release` is active and has
**zero runs** after registration. The V7 application was not merged to `main`.

This closes the workflow-registration prerequisite recorded above. Repository
secrets, the first owner-started `check`/`deploy`, and live evidence remain
pending; the local-testing and evidence boundaries in this report still apply.

## GitHub attempt 3 and congestion fix — 2026-10-18

The owner subsequently authorized adding the dedicated Actions secrets and
starting `check`, then `deploy`. The preflight
[39118117277](https://github.com/Leokings/loophole/actions/runs/39118117277)
passed. Deployment/demo job
[39118206919](https://github.com/Leokings/loophole/actions/runs/39118206919)
saved its checkpoint and automatically dispatched
[39128701218](https://github.com/Leokings/loophole/actions/runs/39128701218).
The handoff between GitHub jobs worked; the second job stopped at r6.

- Source: `5fb8e54e7901e49f3dac82433969afa24e27d617`.
- Republic: `0x0353D0C82e8CC5C6387Bb1f5252070bbE25D3B77`.
- CaseLaw: `0x2Ea38502588e4C5D63651e4c690467f44135aF67`.
- Court: `0x1175adA25D6865bAa2C93510d847f7cB0520b17F`.
- Deployment record: `deployments/abandoned/studionet-2026-10-18T10-15-55.673Z.json`.
- Preserved checkpoint: `live-state` commit
  `5a253e83d6b90f027e8332fa60a05671feee7f66`.
- Saved completed stages: claims, r1–r5; r6 READY_TO_ADVANCE, with all eight
  commit/reveal records present. The snapshot still labels 59 records
  ACCEPTED_PENDING_FINALITY; these are not asserted to be finalized here.

Failure at 13:29 UTC, quoted from the second job:

```text
GenLayer RPC error (gen_call): Server busy: all 8 execution slots occupied, retry later
Version of JSON-RPC protocol is not supported.
Details: Server busy: all 8 execution slots occupied, retry later
Version: viem@2.55.19
```

The transport retried HTTP congestion but did not recognize the equivalent
HTTP-200 JSON-RPC error, so it exited 1 instead of 3. The fix recognizes the
specific execution-slot message, retries the identical payload six times with
15-second linear backoff, and preserves the resumable error through the SDK.
Ordinary `-32600` errors remain fatal; wrapped scenario stops are never retried.
Retry notices contain no RPC arguments or signed payloads.

At the recovery inspection the republic remained at round 6 READY_TO_ADVANCE,
but cases 2 and 3 remained BRIEFING beyond their on-chain resolution deadlines.
`RepublicCourt.resolve_case` correctly refuses them. The reviewed story cannot
continue unchanged. This attempt is archived, not relabeled successful. A fresh
world is required; contracts, deadlines, case outcomes and scenario steps are
unchanged. No production hosting, keeper or Portal changes accompany this fix.

### Independently checked partial live evidence

At 18:00 UTC the read-only SDK checks confirmed case 1 DECIDED / NOT_COVERED /
NO_VIOLATION / NONE, a permanent holding for `2|UNDERMINE|OTHER_FACTION`, and
ruling transaction `0x0d57f557144a53d1438388d4d68c602ee6c20f0de87bcf0de0e4456606405a2f`
FINALIZED with leader SUCCESS. The observed values are preserved in
`deployments/abandoned/studionet-2026-10-18T10-15-55.673Z.partial-evidence.json`.
This proves the first safe harbor on that historical world; it does not prove
summary reuse, the breach/injection cases, amendment closure, the final fallback,
the browser-wallet path, or the completed V7 release.

### Regression and release gates

- `python scripts/verify.py --integration`: passed (99 direct, 2 five-validator
  integration, 82 web tests, web build, 5 scheduler tests and scheduler dry-run).
- Final `npm run check`: passed (83 web tests across 13 files, lint, typecheck
  and build), including the added installed-SDK propagation regression.
- Regression coverage: execution-slot JSON-RPC error in HTTP 200; identical
  signed payload on every retry; six-retry exhaustion → exit 3; nested SDK
  wrapping; ordinary protocol errors remain non-retryable; wrapped scenario
  stops remain non-retryable.
- Technical gate: local fix verified; rerun required for completed live proof.
- Distinctiveness: unchanged V7 contracts/mechanism; final review remains pending.
- Evidence gate: FAIL for a completed V7 release; partial first-impression
  evidence above is valid and explicitly historical.
