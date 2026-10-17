# Claude review — Phase 4 (frontend + V7 keeper) and the Phase 3 fixes

Reviewed 2026-10-17 against `docs/v7/PHASE_4_5_FRONTEND_RELEASE.md` §A and `reviews/PHASE_3_REVIEW.md`, on branch `v7` at `d8cb991`.

## Verdict
The Phase 3 fixes (`c31fb79` … `1aaf6aa`) are **confirmed and closed**. Your `.view()` correction in item 5 also caught a real Phase 3 bug: the CaseLaw read had always been failing silently.

**Phase 4 is approved for Phase 5 part 1 once the three must-fix items below land.** No extra review round is needed if `python scripts/verify.py --integration` and `npm run check` stay green and the named tests exist. Append a "Fixes" section to `docs/v7/reports/PHASE_4.md`.

**Independently re-verified:** I ran `python scripts/verify.py --integration` on `d8cb991`.
- All three contracts lint, validate and typecheck clean.
- Direct tests: 97 passed. Five-validator GLSim: 2 passed.
- Web: 38 passed + production build. Scheduler: 5 passed.

**What's good:**
- The keeper drives purely off `get_keeper_status`: one read per contract, priority order, write cap, stop at the first deferral.
- The `/case-law` page is clean and readable without a wallet.
- Quote highlighting is unit-tested.
- Appeal UI is gone.
- Transaction states resume after a reload.
- The guide copy is updated.

## Must-fix

### 1. One snapshot must cost a small, fixed number of StudioNet reads (rate limit)
`web/src/lib/genlayer.ts` `readRepublicSnapshot` / `readCourtCases`. StudioNet allows about **30 requests per minute and 500 per hour per IP**, and all reads leave Vercel's IPs, as do the keeper's. Today one snapshot costs:

| Read | Calls |
| --- | --- |
| `get_law` for **every** ID from 1 to `law_count` (the V6 world reached 520; pruned IDs still cost a call) | `law_count` |
| `get_case` for up to the 80 most recent case IDs | up to 80 |
| `get_case_outcome` + `get_holding_for_case` for each settled case | 2 per case |
| historical actions (8 rounds × factions) | 32 |
| per-faction objectives and current actions | 8 |
| about 11 singletons | ~11 |

That is roughly **150 calls for a young world and 700+ for an old one, per refresh**. The live site would be rate-limited permanently.

**Fix:** add aggregate views so a snapshot is **≤ 8 RPC calls regardless of world age**.

**Republic `get_public_snapshot() -> dict`**, bounded. Returns:
- `game`, `factions`, `offices`, `objectives`
- `current_actions`: revealed actions of the current round
- `last_summary`: the previous round
- `crisis`: the active crisis plus responses and judgments
- `laws`: every `ENACTED` + `PENDING` law with **full text**, plus the 16 most recent retained resolved laws
- `recent_actions`: actions of the last 8 rounds
- `suit_targets`: the contract's own `_suit_targets(round_number, holdings, ok)` output. The browser must stop re-deriving `_target_class`; one implementation, in the contract.
- `keeper_status`, `storage_stats`

Add a direct test asserting that `len(_canonical_json(get_public_snapshot()))` stays under 200,000 characters in the worst-case setup from `test_worst_case_prompt_fits_without_overflow`.

**Court `get_docket(terminal_limit: int) -> dict`.** Returns:
- every open and stayed case (≤ 64)
- the newest `min(terminal_limit, 20)` retained terminal cases
- for each case: `law_title` / `law_text` from the frozen evidence, plus `holding_present` / `outcome_present` (computed inside the view through the CaseLaw and republic views)
- `keeper_status`, `storage_stats`, `court` info

**CaseLaw:** keep `get_holdings_for_laws`, called only for the snapshot's retained law IDs (≤ 2 calls), plus `get_registry_summary`.

**Web:**
- Rewrite `readRepublicSnapshot` on top of these views and delete `readCourtCases`, the per-law, per-case and per-round loops, and the client-side suit-target derivation.
- Add vitest `snapshot reads stay bounded for an old world`: mock `read` and simulate `law_count = 520`, `case_count = 80`. Assert ≤ 8 calls.

**Also re-check `/api/health`:** it shares the snapshot cache, so it inherits the fix. Confirm it.

### 2. Demo data must obey the contract's own rules
`web/src/lib/demo.ts`. Anyone who opens the site without contract addresses sees demo mode, and today it shows states the contracts make impossible:
- **Wrong class name.** `target_class` / `key` use `NON_OFFICEHOLDER`, which doesn't exist. The real classes are `NONE` / `LAW` / `LAW_SPONSOR` / `OFFICEHOLDER` / `OTHER_FACTION`.
- **Law not marked superseded.** Law #1 is `ENACTED` while the UI says "Loophole closed by law #2". The amendment passed in round 7, so law #1 must be `SUPERSEDED` with `effective_until_round: 7`.
- **Cases cite a law not yet in effect.** Cases 4 and 5 cite law #2 for round-5 actions, but law #2 takes effect at round 9. The court would reject them with `CITED_LAW_NOT_EFFECTIVE`.
- **Summary case owns a holding.** Case 4 is a `SUMMARY`, yet the holding list credits case 4 as the origin of `2|UNDERMINE|…`. A summary never creates a holding.
- **Stay that shouldn't exist.** Case 5 is `STAYED` on a key that already has a holding; it would have been decided as a `SUMMARY` at filing.
- **Hand-written rule text.** `rule_text` values are hand-written instead of the contract template.

**Fix:** rebuild the demo as a faithful, internally consistent replay of the Phase 5 demo story:
1. A vague law becomes `UNADJUDICABLE`.
2. Law #1 creates the safe harbor via a `NOT_COVERED` first impression.
3. A human summary on that key.
4. An officeholder `COVERED_BREACH` → `REPRIMAND`.
5. Amendment v2 is effective, then a fresh v2 first impression.
6. One `STAYED` case behind a `BRIEFING` decider on a new key.
7. One `EXPIRED` case.

Use the contract's rule-text template verbatim.

**Test:** vitest `demo fixture obeys contract invariants`:
- every key equals `` `${law_id}|${action_type}|${target_class}` `` with a real class
- every cited law is effective at the case's `action_round`
- every holding's `case_id` is a `DECIDED` case with the same key
- every `SUMMARY` has a holding with its key and `holding_case_id` equal to that holding's case
- no `STAYED` case's key has a holding
- superseded laws carry `effective_until_round`
- `rule_text` matches the template

### 3. Mobile layout: crisis rows overlap
In the 375 px Chamber screenshot (`phase4-mobile.png`), the crisis faction list overlaps: "CLOSES AFTER ROUND 7" and "NOT_RESPONDED" draw on top of "Old Charter League" / "New Dawn Movement".
- Stack the label/quote under the faction name at narrow widths.
- Make the top nav scroll horizontally instead of clipping "HOW TO PLAY".
- Re-capture `phase4-mobile.png` after the fix.

## Optional
- **Suit-target duplication.** The `suitTargets` client derivation duplicates contract logic; must-fix 1 removes it. If you keep any client-side class computation anywhere, delete it.
- **Production badge.** The Next.js dev "N" badge appears in the screenshots. Make sure screenshots for the docs (Phase 5) come from a production build (`next start`).

## Answer to your open question
**Historical Explorer links:** no indexer for V7.
- For the recorded demo, `deploy/proof.json` (Phase 5) maps every demo case and holding to its transaction hashes. When `proof.json` is present, the Docket and `/case-law` pages should show "Recorded proof: filing / ruling tx" links for those case IDs.
- For other cases, keep the contract links plus the current browser's own filing transaction, as you did.

Add the `proof.json` → case-link mapping in Phase 5 WP-D4 (the proof panel already loads the file).

## Spec change for Phase 5 (made by Claude; read before WP-D1)
I corrected my own timing error in `PHASE_4_5_FRONTEND_RELEASE.md` §B WP-D1.

**The problem:** with the hourly keeper slot, a 900 s fallback grace means the keeper first sees each ready round only after the grace has passed. `get_keeper_status` then lists `advance_round_fallback` instead of `advance_round`, so **every round would settle by fallback and the AI would never play**. The 1800 s judgment window would likewise expire between keeper windows, turning every crisis response into `INSUFFICIENT`.

**The new rules:**
- grace = judgment window = court resolution = **10800 s**
- keeper slot **900 s**
- a deploy-script guard requiring each window to be ≥ 3 × slot
- demo step 9 (fallback) moves to the end of the run
