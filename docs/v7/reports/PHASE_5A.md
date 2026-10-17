# Phase 5A report — release preparation only

## Summary

The local StudioNet release path now checks the reviewed timing windows, runner compatibility through a small probe, clean `v7` source state, pinned contract schemas, finality, and deployed-source equality. The live demo runner is resumable and records each finalized call, expected failure, vote set, and read-back; it keeps its four throwaway wallet keys in the ignored evidence directory. Proof assembly and a read-only verifier produce a case-ID-to-filing/ruling mapping consumed by the Docket and Case Law pages.

README, architecture, tutorial, historical-data blog draft, two-minute demo script, and Portal fields are updated. No live V7 release or V7 proof exists. This is local release preparation, not evidence that the V7 contracts have been deployed or exercised on StudioNet.

## Work packages

| WP | Commit | Status | Notes |
| --- | --- | --- | --- |
| D1 | `379abe7`, `1dfa7bb`, `90f180d` | done (source only) | StudioNet-only resumable deploy script; probe first; deployment order, pinned schemas, clean-branch guard, 10,800 s windows and 900 s keeper slot with a ≥3× guard, finality receipts, link calls, and source equality. Not run. |
| D3 | `7b23990` | partial | Gated, resumable, plan-driven runner with four private throwaway wallets, a four-seat claim requirement, transaction hashes saved before polling, exact per-step records, read-backs, expected-error checks, stop-on-mismatch, and fallback-last validation. A complete round-specific live plan and execution remain outstanding. |
| D4 | `1c6e813` | partial | Proof assembler and read-only chain verifier are implemented. The manifest carries deployment/demo transactions, source digests, vote/execution/consensus data, holding references, and `cases[case_id].filing_tx` / `ruling_tx`; the UI links those transactions from the Docket and Case Law pages. No proof file can be generated or verified without an approved live deployment and finalized demo. |
| D6 | this commit | done (drafts) | README rewrite, preserved history in `CHANGELOG.md`, architecture boundary/finality flow, 500+ word tutorial with source excerpts and mobile screenshot, 500+ word V6 history blog draft, two-minute demo script, and Portal fields draft. No submission or hosting change. |

## Tests

- `npm run check` in `web/` — passed: ESLint, TypeScript, **45 tests across 10 files**, and optimized Next.js production build.
- `python scripts/verify.py --integration` — passed: contract lint/validation/type checks, **97 direct tests**, **2 five-validator GLSim integration tests**, the web check above, **5 scheduler tests**, scheduler dry-run deployment, and final output `Loophole verification passed.`
- `node --check` passed for `deploy-loophole.mjs`, `run-v7-demo.mjs`, `assemble-proof.mjs`, `verify-proof.mjs`, and `v7-release-guards.mjs`.
- `V7 release timing guard`: **5 tests passed**; accepts the reviewed 10,800/900 timing and rejects each guarded window below three keeper slots and a fractional slot.
- Mobile recapture: production-built Chamber at 375 px, [phase4-mobile.png](phase4-mobile.png). Visual review confirmed that crisis details are stacked and the navigation scrolls horizontally.
- `/api/health` source shares `republicSnapshotCache` with the accepted-state route. Its local request returned HTTP 503 because this checkout has no live Republic address configured; cache reuse is confirmed from code, not a live-network measurement.
- No StudioNet deploy, demo write, `verify:proof`, Vercel deploy, or Portal submission was run.

## Deviations from spec

| Spec section | What the spec said | What I did | Why |
| --- | --- | --- | --- |
| WP-D3 | Run the fixed V7 live story as a staged demo. | Implemented a gated runner that consumes a round-specific JSON plan, validates four distinct seat claims, requires the fallback advance to be last, and records every call/read-back; did not author or run a live plan. | Case IDs, faction controllers, election/office targets, and action rounds are deployment-state-dependent. The requested scope is scripts only, and no live deployment is authorized here. The runner remains partial until the plan is prepared and reviewed for the released world. |
| WP-D4 | Produce and independently verify the public `proof.json`. | Added deterministic assembly and read-only verification scripts, plus frontend case-link mapping, but did not produce or verify a manifest. | It requires finalized transactions from the separately approved deployment and demo. No live state was created in this task. |
| WP-D1 | Record the runner hash with the deployment proof. | The artifact records the probe contract address, deployment/write transactions, and verified source digest; `runner.hash` remains `null`. | The pinned SDK exposes no confirmed runner-hash method in the APIs used by this repository. No SDK method was invented. |

## Open questions for Claude

1. Review whether the plan-driven runner plus required scenario assertions is acceptable before the deployment-specific plan is authored.
2. Confirm which source field or official runner identity should populate `runner.hash`; it is currently null rather than guessed.

## Risk notes

- D1 deliberately refuses to run unless the `v7` checkout is clean and its HEAD is present on a remote branch. The current task did not push the branch and did not run the release script.
- The demo runner has an explicit `--confirm-live-studionet` gate. It was not invoked with that flag; generated private keys and transaction records therefore do not exist.
- `deploy/proof.json` and `web/public/proof.json` are absent until a live demo is separately authorized. The UI mapping is implemented but has no V7 transactions to render.
- The runner plan needs concrete cases and exact read-back expectations for the deployed world before it can run end to end. Direct tests and GLSim establish local contract behavior only; neither is live StudioNet proof.
- The V6 production history in `CHANGELOG.md` is historical and must not be presented as V7 evidence.

## Final gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Technical readiness | Partial | Required local checks pass; deployment script is prepared but gated; demo plan is outstanding. |
| Distinctiveness | Drafted | Design comparison and mechanism are documented in `docs/MILESTONE_V7_DESIGN.md`; current review-cohort comparisons remain the owner's pre-submission check. |
| Evidence readiness | Not ready | No V7 StudioNet deployment, finalized demo transactions, proof manifest, or public V7 Explorer links exist. |

## Fixes

The four Phase 5A review blockers were applied on `v7`, one commit per item:

| Review item | Commit | Result |
| --- | --- | --- |
| 1. Code-defined demo scenario | `c1707b1`, `68da97f` | Replaced the JSON-only runner path with `web/scripts/v7-demo-scenario.mjs`. The staged story now waits for phases and rounds at the 15-second RPC-safe interval, persists commit nonces before submission (and reuses them on resume), computes and checks target classes and influence, discovers logical case ids, checks labels/verdicts/sanctions, records finality-callback delivery and recovery, stops on unexpected results, and keeps the fallback stage last. The runner still saves every transaction hash before polling and performs a finality sweep before completion. The proof assembler now consumes the scenario state and refuses to assemble a manifest with non-finalized records; the follow-up also converts court deadline seconds to runner milliseconds. |
| 2. Pinned runner identity | `21dc875` | The release script asserts that the Republic, CaseLaw, Court, and probe sources share one dependency header and records `runner.depends` plus `runner.header_sha256` in the deployment artifact. |
| 3. Historical blog figures | `8491699` | Corrected the V6 score paragraph to the design's recorded wealth values `0, 0, 134` and lifetime totals `900, 920, 3,170`; the remaining figures were rechecked against design §2. |
| 4. README accuracy | `a1630da` | Removed Docker/Compose from the local verification prerequisites and clarified that code checks legality while validators audit the bounded AI batch; the crisis node now names the single label-plus-quote criterion. |

The named scenario tests pass: stage order, nonce persistence before commits, stop-on-unexpected case-C label, fallback-last ordering, and both automatic/recovered `multi_emit_delivered` outcomes (**5 passed**). `node --check` passes for the scenario, runner, and proof assembler.

Final verification after the fixes:

- `python scripts/verify.py --integration` — passed: contract lint/validation/type checks, **97 direct tests**, **2 five-validator GLSim integration tests**, web check, scheduler tests and dry run; final output `Loophole verification passed.`
- `npm run check` in `web/` — passed: lint, TypeScript, **50 tests across 11 files**, and production build.

No StudioNet or Vercel deployment, live demo, proof assembly, push, or Portal submission was run. Phase 5B remains owner-gated and the evidence gate remains not ready until a separately approved live deployment and finalized scenario produce the public proof manifest.

## Fixes (round 2)

The six blockers in `docs/v7/reviews/PHASE_5A_FIXES_REVIEW.md` were applied on `v7`, one implementation commit per blocker:

| Review item | Commit | Result |
| --- | --- | --- |
| 1. Strict stance payloads | `023df14` | Scenario stances now serialize only as the contract list shape (`[]` or `[{'law_id': n, 'stance': 'SUPPORT'}]`); the Vitest scenario test checks the preview calldata. |
| 2. UNDERMINE target fields | `8f3e7c7` | `UNDERMINE` always sends `target_law_id = 0`; the scenario keeps its law used for target classification in `class_law_id`, and the calldata test covers the separation. |
| 3. Round-three law ids | `7221282` | `round3` now resolves its law ids before building the scripted action list. |
| 4. Timing and scheduling | `71b8faa` | Commit/reveal defaults are 600 seconds; previews are read as a batch, commits and reveals are submitted before acceptance waits, `advance_round` proceeds on ACCEPTED, and the Revision 2 READY_TO_ADVANCE stage plan is encoded. The runner also provides the shared 20-reads-per-minute limiter. |
| 5. Missing stages and assertions | `bbb606a` | Added the EOA authority guards and recovery replay check, the round-8 skipped-crisis assertion, the exact four-action AI fallback assertion, and immediate accepted-only brief submission after filing. Finalized transaction records retain decoded return values for the recovery assertion. |
| 6. Contract-shape regression coverage | `2dfb13b` | Added `node web/scripts/v7-demo-scenario.mjs --export-actions`, a committed JSON fixture, the offline direct-mode Python shape test, and Vitest coverage for the Revision 2 stage order. |

Validation after round 2:

- `python scripts/verify.py --integration` — passed: contract lint/validation/type checks, **98 direct tests**, **2 five-validator GLSim integration tests**, web checks, scheduler tests and dry-run deployment; final output `Loophole verification passed.`
- `npm run check` in `web/` — passed: ESLint, TypeScript, **52 tests across 11 files**, and the optimized Next.js production build.
- `node --check` passed for the revised scenario and runner scripts.

No StudioNet or Vercel deployment, live demo, proof assembly, push, or Portal submission was run. The owner should return this branch for the requested final review before any live run.
