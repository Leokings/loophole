# Claude review — Phase 3 (CaseLaw, Court V5, FILE_SUIT)

Reviewed 2026-10-17 against `docs/v7/PHASE_3_CASELAW_COURT.md`, on branch `v7` at `62eb2ec`. The Phase 1 fixes (`8896f1f`, `6a7d8c2`, `099a8ad`, `7666d62`) are confirmed and closed.

## Verdict
**Approved for Phase 4 once the seven must-fix items below land.** No extra review round is needed, provided `python scripts/verify.py --integration` stays green and every new test named below exists. Append a "Fixes" section to `docs/v7/reports/PHASE_3.md`, then start Phase 4 (apply the §A notes at the end of this file).

**Independently re-verified:** I ran `python scripts/verify.py --integration` on `62eb2ec`.
- All three contracts lint, validate and typecheck clean.
- Direct tests: 90 passed. Five-validator GLSim: 2 passed.
- Web: 36 passed. Scheduler: 5 passed.

**What's good:**
- CaseLaw is minimal and correct: court-only writes, idempotent by key + case + digest, conflict rejection, and a per-law cap.
- Court routing (holding → summary, decider → stay, else brief) matches the spec.
- `resolve_case` uses only locals inside the nondeterministic functions.
- The quote is checked against the frozen law text.
- Verdict and sanction are fully code-derived.
- Expiry is fail-closed, and the terminal-case ring buffer is correct.
- Your deviation on WP-C6 step 3 is correct; the spec contradicted itself (see the answer below).
- Finding the GLSim one-message limit and documenting it was valuable.

## Must-fix

### 1. The court prompt must separate `NOT_COVERED` from `COVERED_COMPLIANT` (consensus risk)
`contracts/RepublicCourt.py` `_case_prompt`.

Take law "No faction may UNDERMINE a faction that holds public office" and an UNDERMINE against a non-officeholder. Validators can reasonably split between `NOT_COVERED` ("the prohibition doesn't reach it") and `COVERED_COMPLIANT` ("the law regulates UNDERMINE and the action complies"). Both give `NO_VIOLATION`, but they create different holdings, so consensus fails on the demo's central case. The project guide calls this out as the #1 live failure mode.

Replace the label instructions with these definitions, verbatim:

> - COVERED_BREACH: the law prohibits or requires something, the recorded action falls within the conditions the law states, and the action violates it.
> - NOT_COVERED: the law's prohibition or requirement does not apply to this action as recorded — a different action type, or a target or condition outside the law's stated conditions. Quote the words that set the law's scope.
> - COVERED_COMPLIANT: only for laws that impose an affirmative requirement on this kind of action (for example "a faction that proposes a law must ..."), when the action falls within the law and satisfies that requirement. Quote the requirement.
> - Rule: if the action falls outside a prohibition's stated conditions, the label is NOT_COVERED, never COVERED_COMPLIANT.
> - UNCLEAR: the law's words genuinely cannot decide whether the action falls within them.

Also add one sentence explaining `target_class` and `target_was_officeholder` (they are code-computed facts at the action's round).

**Test:** `test_case_prompt_defines_scope_labels_with_tie_break` asserts that the prompt contains the tie-break sentence. Re-run WP-C6.

### 2. The keeper must recover dropped finality messages (liveness)
`resolve_case` emits two finalized messages in one transaction; your GLSim run delivered only one.

If the holding message is lost on the live network, every case stayed on that key waits forever, because `resolve_stayed_case` keeps raising `CASE_STILL_STAYED`. If the outcome message is lost, the sanction never applies. Nothing calls `recover_case_effects` automatically.

**Fix:**
- Add `RECOVERY_DELAY_SECONDS = 1800`.
- In the court's `get_keeper_status`, also scan the **16 most recent** retained terminal cases. Add `{"method": "recover_case_effects", "args": [id]}` when all of these hold:
  - status is `DECIDED` or `SUMMARY`
  - `now >= decided_at + RECOVERY_DELAY_SECONDS`
  - either the holding is missing (label not `UNCLEAR` and `caselaw.get_holding(key)` is empty) or the outcome is missing (verdict not `AMBIGUOUS` and `republic.get_case_outcome(id) == ""`)
- Order: `expire` → `resolve` → `stayed` → `recover`.

**Test:** `test_keeper_lists_recovery_for_missing_effects_after_delay`. Cover: listed only after the delay, not listed once both effects are readable, and not listed for `UNCLEAR` / `AMBIGUOUS`.

### 3. The AI action prompt has a sentence spliced mid-sentence
`contracts/AutonomousRepublic.py` `_ai_action_prompt`. The new text was inserted between "Each faction must pursue its own " and "doctrine and resources independently". The model currently reads "...must pursue its own Safe harbors are binding court holdings... doctrine and resources independently".

**Fix:** restore the original sentence and put the safe-harbor sentence on its own, after it. Use this exact text:

> "Holdings are binding court precedent for the listed law version: a NOT_COVERED holding (safe_harbor true) means that action type against that target class is not covered by the law; a COVERED_BREACH holding means it violates the law."

Apply the same wording to the audit prompt.

**Test:** `test_ai_prompt_sentences_are_intact` asserts that both full sentences appear unbroken.

### 4. The AI prompt must stay bounded as case law grows (liveness)
Three things grow without limit or are verbose today:
- `_read_holdings` puts every holding for every eligible law (up to 65 per law) into the prompt, each with digest, case ID and timestamp.
- Menus are sent as full option objects (40 per faction).
- `prompt_overflow` makes every missing faction fall back.

As precedent accumulates, the world would stop thinking. More case law means more fallback rounds, which is the opposite of the milestone's story.

**Fix:**
- **Menus in the prompt:** send `{faction_id: [option_id, ...]}`. Add one legend line: options starting with `PROPOSE_LAW`, `PROPOSE_CHARTER` or `AMEND_LAW` need `law_title` and `law_text`; all others must leave them empty. Keep the full option objects internally for canonicalization; the validator logic is unchanged.
- **Holdings in the prompt:** pass at most `MAX_PROMPT_HOLDINGS = 24` compact entries, `{key, label, quote[:120], safe_harbor}`.
  - Include only holdings on currently `ENACTED` laws.
  - Order: `NOT_COVERED` first, then `COVERED_BREACH`, then `COVERED_COMPLIANT`, each sorted by key.
  - Keep the full holding list for `_suit_targets` (it's a view read, not prompt text).
- **Overflow order:**
  1. Shorten law previews (exists).
  2. Then drop holdings to the 8 most recent safe harbors.
  3. Only then fall back to all-`AI_FALLBACK`.
  - Record `prompt_shortened` for either reduction.
- **Test:** `test_worst_case_prompt_fits_without_overflow` sets up 8 factions, 16 enacted laws with 800-char texts, 8 pending laws, at least 40 holdings, every faction missing and an election open. Assert the round settles with `prompt_overflow == False` and the prompt length (from the captured prompt) ≤ `MAX_PROMPT_CHARS`. If 8 factions is impractical in direct mode, use the largest feasible setup and extrapolate in the report.

### 5. A failed holdings read must disable suits (fail closed)
WP-C4 says: "If CaseLaw is unlinked or the read fails: `holdings = []` and **no suits are offered**." Today `_read_holdings` swallows the error and returns `[]`. `_suit_targets` then offers suits for **every** key, including keys that are safe harbors, because it can no longer see them.

**Fix:**
- `_read_holdings` returns `(holdings, ok)`.
- `_suit_targets` returns `[]` when `ok` is false.
- Apply this in `advance_round`, `reveal_action` and `preview_action_commitment`.

**Test:** `test_holdings_read_failure_offers_no_suits`. Use a linked CaseLaw whose `get_holdings_for_laws` call raises via the direct-mode hook; the menu has no `FILE_SUIT` options and a human `FILE_SUIT` reveal fails `ACTION_SUIT_TARGET`. The current `test_holdings_unavailable_fails_closed` only covers the unlinked case.

### 6. Suits must survive the menu cap
`_legal_options` appends `FILE_SUIT` options last and then truncates to 40. With a full code (16 enacted laws), the amend + repeal options alone reach 32. With undermines, proposals and offices on top, every suit option is cut. AI litigation is a headline feature and must not disappear when the legislature is busy.

**Fix:** build the non-suit candidates, truncate them to `MAX_MENU_OPTIONS - min(len(suit_candidates), MAX_MENU_SUITS)` with `MAX_MENU_SUITS = 8`, then append up to 8 suits. `BUILD_INFLUENCE` and `GROW_WEALTH` must still always be present.

**Test:** `test_menu_reserves_suit_slots_when_code_is_full`.

### 7. Bound the action-keyed court maps, and lock the replay invariant
`court_action_ruling_digests` and `vindicated_actions` grow by one entry per sanctioned or vindicated action and are never pruned.

**Fix:** in `_prune_round_history`, delete both map entries for every faction's action key in the pruned round. This is safe: cases can only be filed within 8 rounds, so no outcome for a pruned action can be valid.

**Test:** `test_replayed_outcome_after_retirement_is_rejected`.
1. Apply a `NO_VIOLATION` outcome.
2. Advance past `HISTORY_ROUNDS`, so the case outcome is retired and the round is pruned.
3. Call `apply_case_outcome` again as the court with the same arguments. It must fail `COURT_ACTION_NOT_FOUND`, and the plaintiff's legitimacy is unchanged.

This locks the invariant that keeps `recover_case_effects` from double-penalizing after retirement.

## Optional
8. **Pruning a pending decider.** `_mark_terminal` can prune a `DECIDED` (non-`UNCLEAR`) decider while its holding is still awaiting finality. Its `deciding_case_by_key` entry then goes too, and a stayed case can take over and produce a conflicting holding (the CaseLaw write would fail with `HOLDING_CONFLICT`). This needs 64 terminal cases inside one finality window, so it's unlikely. A cheap guard: when pruning such a decider, keep its `deciding_case_by_key` entry, and let `resolve_stayed_case` treat "decider pruned **and** no holding yet" as still stayed until `RECOVERY_DELAY_SECONDS` after `decided_at`. Skip it if it's not quick, and note it.

## Answer to your open question
**WP-C6 step 3:** keep your implementation. The spec contradicted itself: AI suits deliberately exclude safe-harbor keys. A summary on a safe-harbor key is demonstrated by a **human** plaintiff (`file_case` has no such exclusion), which is what Phase 5 WP-D3 step 4 already does. The AI summary on an eligible `COVERED_BREACH` key is the right integration test for `FILE_SUIT`.

## Carry into Phase 5 (no action now)
- **Multiple finalized messages per transaction:** live StudioNet must show whether both `resolve_case` messages, and several `FILE_SUIT` filings in one round, are delivered. Phase 5 records this explicitly.
- **If live delivers only one message:**
  - The court should emit a single message to the republic, and the republic should forward the holding to CaseLaw (the republic would become CaseLaw's writer instead of the court).
  - `FILE_SUIT` should be limited to one per round: the first in seat order; the others are refunded and recorded as `SUIT_DEFERRED`.
  - Claude will spec this if needed. Don't pre-build it.

## Phase 4 notes (apply when building §A)
- The court keeper status now includes `recover_case_effects` (item 2). The keeper executes it like any other op.
- The round summary shape changed in Phase 1 fixes (`crisis_status_after`, `prompt_shortened`). Use it in the Chamber UI.
- The Docket shows "Effects pending: holding / outcome" for a `DECIDED` / `SUMMARY` case whose effects aren't readable yet, with the same 30-minute recovery hint.
