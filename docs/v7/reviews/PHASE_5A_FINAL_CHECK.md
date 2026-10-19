# Claude final check — before the live run

Reviewed 2026-10-17 on branch `v7` at `f062a98`.

**Independently re-verified:** `python scripts/verify.py --integration` passed.
- Direct tests: 98, including the new `test_every_demo_action_matches_republic_calldata_shape`.
- GLSim: 2. Web: 52 + build. Scheduler: 5.

**Round-2 blockers 1–6: closed.**
- Stances are lists.
- UNDERMINE sends `target_law_id = 0` (with `class_law_id` used only for the class check).
- `round3` resolves its law IDs.
- The 600 s windows are in place, along with batched commits and reveals, `advance_round` sequenced on ACCEPTED, and every side stage parked at READY following the Revision 2 table.
- The guards stage, the r8 `crisis_skipped` assertion and the strict r10 fallback check are all present.
- The shape test is real: it runs every scripted move through the contract's own `_canonical_action_values` and `_strict_stances_json`.

Your edit to `PHASE_5_DEMO_SCENARIO.md` (300 → 600 in two places) is accepted: it matches Revision 2. In future, leave spec edits to Claude per `AGENTS.md`.

## Three last fixes (small; no further Claude review needed if the checks stay green)

### 1. The crisis response is never sent, so the run would stop at r6
Revision 2 (R2-3) moved Reformers' crisis response to **r5**, because the crisis opens at r4's READY, after r4's commits. `round4` correctly plays BUILD. **But `round5` still plays BUILD for REFORMERS.** No response exists, so `judge_crisis_response(crisis, "REFORMERS")` fails with `CRISIS_RESPONSE_NOT_JUDGEABLE` and the run stops.

**Fix:** in `round5`, REFORMERS plays `commonAction("REFORMERS", ACTIONS.RESPOND, "Reopen the two northern grain routes with Reformer escorts and publish a ration ledger each round.")` when `state.crisis_opened` is non-zero, and BUILD otherwise. In `judgeCrisis`, return early, with no judge or close, if R didn't respond. Update `buildExportActionLists` round 5 to the `RESPOND_CRISIS` variant; the shape test already supplies an `ACTIVE` crisis.

### 2. `INSUFFICIENT` must not stop the run
`judgeCrisis` stops when `!judgment.quote`. For `INSUFFICIENT`, the contract **requires** an empty quote, and the scenario accepts any of the three labels.

**Fix:** require a non-empty quote only for `MET` / `NOT_MET`. For `INSUFFICIENT`, require `quote === ""`.

### 3. Don't rely on decoding the recovery return value
`guards` stops unless `parseJson(recovery.return_value)` yields `{holding_reemitted: false, outcome_reemitted: false}`. The receipt's leader `result` may be GenVM-encoded rather than JSON, which would stop a run that actually behaved correctly.

**Fix:**
- Record the raw `return_value`.
- Try to decode it, and if decoding works, assert both flags are false.
- If decoding fails, **don't stop**; rely on the existing read-back equality (`case_outcome_count`, every legitimacy, plus `caselaw.get_holding(A.key)` unchanged, which you should add) and record `return_value_decoded: false`.
- Stop only if the read-backs change.

**Tests:** extend `v7-demo-scenario.test.mjs`:
- r5 plays `RESPOND_CRISIS` when a crisis is open
- `INSUFFICIENT` with an empty quote does not stop
- an undecodable recovery return value does not stop while unchanged read-backs pass

Run `python scripts/verify.py --integration` and `npm run check`, then append a short "Fixes (round 3)" section to `PHASE_5A.md`.

## Go-live checklist (owner)

**1. Final fixes.** Codex applies the three fixes above. Confirm both checks are green.

**2. Push `v7`.** The deploy script refuses to run unless HEAD is on the remote.

```bash
git -C C:/Users/leoki/Genlayer/Loophole push origin v7
```

**3. Set a dedicated deployer key.** Put a new, empty key in `web/.env.local` as `GENLAYER_DEPLOYER_PRIVATE_KEY`. StudioNet is gasless, so it needs no funds. **Not the keeper key.**

**4. Deploy just after 00:00 UTC.** Codex runs it with the Phase 5B prompt in `docs/v7/CODEX_KICKOFF.md`:
1. WP-D2/D1: probe + deploy.
2. The scenario: `run-v7-demo.mjs … --confirm-live-studionet`.
3. `assemble-proof` → `verify:proof`.
4. WP-D5 budget measurement.

Expect **6–9 hours**. It is resumable if interrupted.

**5. Leave the keeper on V6** until Claude has reviewed the Phase 5B evidence. Only then set the Vercel env to V7 (WP-D6 hosting step, with a separate approval).
