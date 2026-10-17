# Claude review — Phase 1 + 2 (AutonomousRepublic V7)

Reviewed 2026-10-17 against `docs/v7/PHASE_1_2_REPUBLIC.md`, on branch `v7` at `64f2d71` (six commits ahead of `main`).

## Verdict
**Approved for Phase 3 once the three must-fix items below land.** No further review round is needed for them, provided `python scripts/verify.py --integration` stays green. Append a "Fixes" section to `docs/v7/reports/PHASE_1.md`, then start Phase 3.

**Independently re-verified:** I ran `python scripts/verify.py --integration` on `64f2d71`.
- Both contracts lint, validate and typecheck clean.
- Direct tests: 75 passed. Five-validator GLSim: 1 passed.
- Web: 36 passed. Scheduler: 5 passed. Dry run: passed.

**What's good:**
- `_strict_leader_batch` re-derives every leader entry from the menu, so a forged field can't slip through.
- Per-faction fallback can't fail a round.
- `advance_round_fallback` makes no model call.
- Certification, crisis judgments and their quote checks follow the spec.
- Season reset and caps are correct.
- The tests drive the real validator path (`run_validator`) instead of only checking the happy path.
- The storage proxy fell from 301,962 to 36,604 characters at 200 rounds.

## Must-fix

### 1. A passed repeal order permanently occupies a law-code slot
`contracts/AutonomousRepublic.py` ~L1728–1754 (`_resolve_due_laws`, enactment branch).

When a `REPEAL` law passes, it goes through the generic enactment path:
- it becomes `ENACTED`
- `active_law_count += 1`, and it is added to `active_law_ids`
- the parent is then removed (`-1`)

So the count stays the same, and the slot is now held by a repeal order that isn't a rule and is never retired. Over a long-running world, repeal orders accumulate until all 16 slots are full of them. Every new statute and charter is then rejected `CODE_FULL` forever. The spec says "A repeal decrements the count."

**Fix:**
- Add `LAW_APPLIED = "APPLIED"`: the terminal status for a repeal order that has taken effect.
- When a `REPEAL` passes:
  - set the repeal law's status to `APPLIED`, `resolved_round = current_round`, `effective_from_round = current_round + 1`
  - do **not** add it to `active_law_ids` or `active_law_count`
  - enqueue it for retirement immediately
  - parent → `REPEALED`, `effective_until_round = current_round`; remove the parent from active IDs; `active_law_count -= 1`; enqueue the parent
  - keep the sponsor rewards (`laws_enacted`, +2 season points, +1 legitimacy), as for any passed law
- Make sure `APPLIED` laws are never offered as `AMEND_LAW` / `REPEAL_LAW` / `VETO_LAW` targets. The existing kind check already blocks them; keep a test.

**Tests:**
- `test_repeal_frees_a_code_slot`: enact a law, then repeal it. `active_law_count == 0`; the law is `REPEALED` and the order is `APPLIED`; both are pruned 24 rounds later.
- `test_repeal_reopens_a_full_code`: fill the code to 16 enacted laws, repeal one, then enact a new statute. It is `ENACTED`, not `CODE_FULL`. The test may use a smaller custom setup if 16 enactments is too slow; record the approach in the report.

### 2. `certify_law` reads contract storage inside the nondeterministic functions
~L2219–2236. `leader_fn` and `validator_fn` use `law.text`, where `law` is a storage-backed record (`self.laws[law_id]`). Both GenLayer guides and `AGENTS.md` require snapshotting into plain locals before `leader_fn` / `validator_fn`.

**Fix:** before defining the functions, add `law_text = str(law.text)`. Use `law_text` in both functions and in the post-consensus canonicalization. Do a quick sweep for any other leader/validator body that touches a storage-backed object. `open_crisis`, `judge_crisis_response` and `advance_round` already use locals.

### 3. `target_was_officeholder` is only set for `UNDERMINE`
~L1469–1475 (`_store_action`). The spec says the flag is true iff `target_faction_id` currently holds any office, whatever the action type. Phase 3's `FILE_SUIT` (and the court's `_target_class`) depend on it for every action that targets a faction.

**Fix:** set it whenever `target_faction_id != ""`.

**Test:** `test_officeholder_flag_is_recorded_for_any_faction_target`. Cover `UNDERMINE` against an officeholder (true) and against a non-officeholder (false), plus an action with no target (false).

## Optional (do only if quick; record in the report either way)
4. **`prompt_overflow` means two things.** It is set to `true` both when the shortened prompt fits and when every faction falls back. Split it into `"prompt_shortened": bool` and `"prompt_overflow": bool` (overflow means the all-fallback settlement only).
5. **Dead fields.** `_crisis_bookkeeping` always returns `{}`, and the summary's `crisis_resolution` / `opened_crisis` are always empty now that crises open and close in their own transactions. Remove them, or replace them with `"crisis_status_after"` (status + id). The frontend in Phase 4 will read whichever you choose; note it in the report.

## Answers to your open questions
1. **Audit codes:** keep your four-code list (`HIDDEN_INFO`, `INSTRUCTION_IN_TEXT`, `TARGETS_HUMAN_WITHOUT_REASON`, `COLLUSION`). The WP-R0 constant also listed `RATIONALE_MISMATCH`, but it is the most subjective code, and every extra rejection reason costs round liveness. Treat the four-code list as authoritative.
2. **Combined R1–R5 commit:** accepted. Don't rewrite history. For Phase 3, keep one commit per work package where the files allow it. The three new contracts make that easier.

## Notes carried into Phase 3
- The V4 callback maps (`court_ruling_digests`, `court_rulings_json`, `court_action_*`) are unbounded today. WP-C4 replaces them with `apply_case_outcome` and the `"CASE"` retirement kind, so make sure the old maps are removed, not left alongside.
- Phase 3 has to run against the post-fix `_store_action` (item 3).
