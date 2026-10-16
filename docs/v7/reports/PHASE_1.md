# Phase 1 report

## Summary
AutonomousRepublic now uses bounded round, law, crisis, and season history; legal option menus and per-faction fallback; free, commitment-bound law stances; law certification; narrow crisis judgments; full season resets; resource caps; and a keeper status view. The integration scenario exercises the V7 lifecycle with five GLSim validators. All local checks passed after correcting the scenario to use the contract's minimum eight-round season.

## Work packages
| WP | Commit | Status (done / partial / skipped) | Notes |
| --- | --- | --- | --- |
| WP-R0 | `83be624` | done | Republic V7 foundations were already committed on this branch. |
| WP-R1 | `b8b3e44` | done | Bounded Republic histories, retirement queues, active-law cap, and storage statistics. |
| WP-R2 | `b8b3e44` | done | Legal menus, strict canonicalization, per-seat fallback, fallback settlement, and prompt overflow behavior. |
| WP-R3 | `b8b3e44`, `f799b48` | done | Free stances, sponsor support, two-round voting, law certification, and explicit repeal-without-certification coverage. |
| WP-R4 | `b8b3e44` | done | Crisis opening, response judging, deterministic close, and deadline fallback. |
| WP-R5 | `b8b3e44`, `f5a47b9` | done | Season reset, resource caps, legitimacy awards, and keeper status, with isolated reset and legitimacy tests. |
| WP-R6 | `7f0daed` | done | Five-validator GLSim lifecycle scenario. This report records the final verification. |

The Republic changes share one large contract and several cross-package data-shape changes, so R1–R5 were committed together to keep that implementation atomic. R6 remains a separate integration commit. This differs from the requested one-commit-per-work-package history and is submitted as an explicit review question.

## Tests
- `python scripts/verify.py --integration` — **Loophole verification passed.** Republic and Court contract lint/typecheck passed; direct tests **75 passed**; five-validator GLSim **1 passed**; web lint/typecheck/build passed, web tests **36 passed**; scheduler typecheck passed, scheduler tests **5 passed**, deployment dry run passed.
- Focused Republic tests: `python -m pytest tests/direct/test_republic_v7.py tests/direct/test_republic_crisis.py -q` — **25 passed**.
- Bounded storage soak: `python -m pytest tests/direct/test_republic_bounded_state.py::test_storage_stats_stay_bounded_over_200_rounds -q -s` — **1 passed in 5.76s**.
- `git diff --check` — passed before commit (only Git line-ending notices were emitted).

New tests by work package:
- **R1:** `test_round_records_older_than_history_window_are_pruned`, `test_terminal_laws_are_pruned_after_history_window`, `test_resolved_crises_are_pruned_after_history_window`, `test_enacted_law_cap_rejects_with_code_full`, `test_storage_stats_stay_bounded_over_200_rounds`.
- **R2:** `test_menu_only_contains_legal_options_and_always_has_safe_actions`, `test_one_invalid_ai_entry_falls_back_only_that_faction`, `test_garbage_ai_output_falls_back_every_faction_without_failing`, `test_validator_rejects_forged_leader_entry`, `test_validator_rejects_entry_marked_fallback_with_wrong_action`, `test_validator_accepts_only_when_no_allowlisted_violations`, `test_fallback_settlement_requires_grace_and_uses_no_llm`, `test_prompt_overflow_settles_with_fallbacks`, `test_human_commitment_binds_stances`.
- **R3:** `test_stances_are_free_and_do_not_consume_the_action`, `test_sponsor_counts_as_support_and_cannot_vote_against_itself`, `test_later_stance_overwrites_earlier_and_abstain_clears`, `test_later_opposition_overwrites_support`, `test_two_round_window_enacts_with_majority_stances`, `test_uncertified_law_expires_and_unadjudicable_law_is_terminal`, `test_certification_rejects_non_verbatim_quote`, `test_certification_injection_text_cannot_force_adjudicable`, `test_repeal_needs_no_certification`.
- **R4:** `test_advance_round_makes_no_crisis_llm_call`, `test_open_crisis_derives_severity_from_stability`, `test_crisis_open_slot_is_skipped_if_nobody_opens_it`, `test_judge_requires_exact_label_and_verbatim_quote`, `test_judge_injection_in_response_cannot_force_met`, `test_close_after_deadline_treats_unjudged_as_insufficient`, `test_close_applies_fixed_consequences_and_outcomes`.
- **R5:** `test_finalize_starts_next_season_with_full_reset`, `test_resources_are_capped_at_twenty`, `test_enacted_sponsor_and_met_crisis_raise_legitimacy`, `test_keeper_status_lists_ops_in_priority_order`, `test_finalize_waits_for_open_crisis_judging`.
- **R6:** `test_republic_v7_five_validator_lifecycle_reaches_consensus`.

## Deviations from spec
| Spec section | What the spec said | What I did | Why |
| --- | --- | --- | --- |
| WP-R2 audit allowlist | The phase spec names four accepted audit codes. A related design constant also lists `RATIONALE_MISMATCH`. | Implemented the four-code list from WP-R2: `HIDDEN_INFO`, `INSTRUCTION_IN_TEXT`, `TARGETS_HUMAN_WITHOUT_REASON`, `COLLUSION`. | The phase spec is more specific and explicitly says to ignore unknown codes. Please confirm this is intended. |
| Commit workflow | One commit per work package. | R1–R5 are in `b8b3e44`; R6 is in `7f0daed`. | The changes share a contract file and cross-package stored-action schema. This is a process deviation for Claude to review. |

## Open questions for Claude
1. Should the audit allowlist include `RATIONALE_MISMATCH`, or is the four-code WP-R2 list authoritative?
2. Is the combined R1–R5 contract commit acceptable given the shared state and action-schema changes, or should it be rewritten into individual work-package commits?

## Risk notes
- Direct-mode retained-string proxy after 200 rounds: V6 source from `main` **301,962 characters**; V7 **36,604 characters**. V7 retains 24 round records and prunes terminal histories. The comparison is a character-count proxy over retained stored text, not serialized contract snapshots; the two runs also do not establish equal crisis workloads.
- `del` behavior may not reduce StudioNet snapshot charges. The live measurement is explicitly deferred to Phase 5 WP-D5.
- The existing Republic-to-Court callback maps remain present to preserve the V4 court interface. Phase 3 should review their boundedness while adding Court V5.
- The five-validator run is GLSim evidence only. It is not a StudioNet deployment or proof of live-network fees, finality behavior, or appeal semantics.
- The integration fixture initially failed because it requested a six-round season (`SEASON_ROUNDS`); the fixture was corrected to eight rounds and the full verification command passed afterward.

## Public method list
`open_crisis`, `judge_crisis_response`, `close_crisis`, `get_game`, `get_keeper_status`, `get_storage_stats`, `certify_law`, `get_factions_json`, `get_faction`, `get_controlled_faction`, `is_active_faction_controller`, `preview_action_commitment`, `get_round_action`, `get_round_summary`, `get_law`, `get_office`, `get_offices_json`, `get_objective`, `get_crisis`, `get_season_summary`, `preview_objective_commitment`, `commit_objective`, `reveal_objective`, `finalize_season`, `get_court_ruling`, `is_court_action_sanctioned`, `set_court_address`, `apply_court_ruling`, `claim_faction`, `release_faction`, `recover_abandoned_faction`, `commit_action`, `reveal_action`, `advance_round_fallback`, `advance_round`.
