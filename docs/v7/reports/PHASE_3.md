# Phase 3 report

## Summary
- Added permanent CaseLaw holdings and replaced the V4 case/appeal workflow with Court V5: one certified law per case, frozen evidence, quote-checked judgments, summary dispositions, stays, expiry, and bounded retained cases.
- Connected Republic V7 to CaseLaw and Court, added `FILE_SUIT`, bounded outcomes, and a permissionless recovery path for finality effects.
- The complete three-contract GLSim lifecycle passed with five mock validators, including law amendment, human and AI cases, safe harbor, sanctions, and rejected invalid operations.
- No live network deployment or release was performed. The integration evidence is local GLSim evidence.

## Work packages
| WP | Commit | Status (done / partial / skipped) | Notes |
| --- | --- | --- | --- |
| C1 | `54d583c` | done | Added the permanent CaseLaw registry and authorized, idempotent holding writes. |
| C2 | `3d20f87` | done | Added one-law filings and frozen evidence in Court V5. |
| C3 | `c5232bb` | done | Added quote-validated first impressions, summary routing, stays, expiry, and finality emissions. |
| C4 | `6e015f5` | done | Connected Republic outcomes and AI `FILE_SUIT`; made a missing case outcome read as the empty value required by the recovery contract. |
| C5 | `95a755e` | done | Bounded retained terminal cases to 64. |
| C6 | this report's commit | done | Added the three-contract five-validator scenario and included CaseLaw lint/typecheck in the verifier. |

## Tests
`python scripts/verify.py --integration` — **passed**. Contract lint/validation/typecheck passed for all three contracts; **90 direct tests passed**; **2 five-validator GLSim tests passed**; web lint/typecheck/build passed with **36 web tests passed**; scheduler typecheck passed with **5 tests passed**; deployment dry-run passed. Existing Vite `esbuild` deprecation warnings remain.

WP-C1 direct tests: `test_only_linked_court_records_holdings`, `test_record_is_idempotent_and_conflicts_are_rejected`, `test_holdings_are_listed_by_law`, `test_key_must_match_components`.

WP-C2 direct tests: `test_case_cites_exactly_one_certified_effective_rule`, `test_republic_filing_requires_republic_sender`, `test_claim_key_ignores_claim_wording`, `test_evidence_freezes_target_class_and_key`.

WP-C3 direct tests: `test_first_impression_requires_equal_label`, `test_forged_quote_is_rejected_even_with_correct_label`, `test_validator_rejects_extra_fields_or_unknown_label`, `test_unclear_creates_no_holding_and_releases_the_key`, `test_summary_disposition_makes_no_llm_call`, `test_second_filing_on_same_key_is_stayed_then_summarized`, `test_stayed_case_becomes_decider_after_unclear_or_expiry`, `test_expiry_is_fail_closed`, `test_sanction_points_from_constitutional_and_repeat_offense`, `test_claim_injection_cannot_force_breach`, `test_effects_are_emitted_on_finalized_only`.

WP-C4 direct tests: `test_case_outcome_applies_once_per_action_and_rewards_plaintiff_once`, `test_no_violation_penalizes_plaintiff_and_vindicates_once`, `test_file_suit_menu_excludes_safe_harbor_and_compliant_keys`, `test_file_suit_costs_influence_and_emits_filing`, `test_holdings_unavailable_fails_closed`.

WP-C5 direct test: `test_court_retains_bounded_terminal_cases`.

WP-C6 integration tests: `test_republic_v7_five_validator_lifecycle_reaches_consensus`, `test_three_contract_caselaw_court_file_suit_lifecycle`.

## Public method lists

- **AutonomousRepublic (35):** `open_crisis`, `judge_crisis_response`, `close_crisis`, `get_game`, `get_keeper_status`, `get_storage_stats`, `certify_law`, `get_factions_json`, `get_faction`, `get_controlled_faction`, `is_active_faction_controller`, `preview_action_commitment`, `get_round_action`, `get_round_summary`, `get_law`, `get_office`, `get_offices_json`, `get_objective`, `get_crisis`, `get_season_summary`, `preview_objective_commitment`, `commit_objective`, `reveal_objective`, `finalize_season`, `get_case_outcome`, `is_court_action_sanctioned`, `set_links`, `apply_case_outcome`, `claim_faction`, `release_faction`, `recover_abandoned_faction`, `commit_action`, `reveal_action`, `advance_round_fallback`, `advance_round`.
- **CaseLaw (6):** `set_court`, `record_holding`, `get_holding`, `get_holding_for_case`, `get_holdings_for_laws`, `get_registry_summary`.
- **RepublicCourt (12):** `file_case`, `file_case_from_republic`, `submit_brief`, `resolve_case`, `expire_case`, `resolve_stayed_case`, `recover_case_effects`, `get_keeper_status`, `get_case`, `get_open_case_ids`, `get_court`, `get_storage_stats`.

## WP-C6 transaction trace

| Transaction | Status | Read-back |
| --- | --- | --- |
| `0x…0015` `caselaw.set_court` | FINALIZED | CaseLaw registry points to Court; holding count 0. |
| `0x…0016` `republic.set_links` | FINALIZED | Republic reports Court configured. |
| `0x…0018` V1 certification and enactment | FINALIZED | Law 1 is `ENACTED`, certified `ADJUDICABLE`, effective from round 5. |
| `0x…001e` human safe-harbor suit | FINALIZED | Case 1 entered `BRIEFING`. |
| `0x…0020` human resolution | FINALIZED | `NOT_COVERED`; read-back shows the verbatim law quote in CaseLaw and the Republic outcome `NO_VIOLATION`. |
| `0x…0023` human officeholder-breach resolution | FINALIZED | `COVERED_BREACH`, `VIOLATION`, `REPRIMAND`; Republic marks the action sanctioned and plaintiff legitimacy increases by one. |
| nested `FILE_SUIT` finality message | FINALIZED | Case 3 has source `REPUBLIC`, status `SUMMARY`, label `COVERED_BREACH`; read-back confirms no `resolve_case` was needed. |
| `0x…002d` V2 first-impression resolution | FINALIZED | Law 2 holding reads back as `COVERED_BREACH` with the exact V2 quote. |

The local GLSim engine drains only one queued post-message per top-level transaction and clears any additional queued messages. The integration therefore invokes the specified idempotent `recover_case_effects` path until both the CaseLaw holding and Republic outcome are readable. The Republic's `get_case_outcome` now returns `""` when no outcome exists, matching the recovery method's specified empty-value check. The later replay leaves the outcome count and legitimacy unchanged.

## Deviations from spec
| Spec section | What the spec said | What I did | Why |
| --- | --- | --- | --- |
| WP-C6, steps 2–3 vs. WP-C4 `FILE_SUIT` eligibility | Step 3 asks for an AI `FILE_SUIT` summary from a second non-officeholder undermine after step 2 has created a `NOT_COVERED` safe harbor. WP-C4 explicitly removes any `NOT_COVERED` or `COVERED_COMPLIANT` key from eligible suit targets. | The integration verifies the non-officeholder safe harbor, then verifies an AI summary for an eligible officeholder `COVERED_BREACH` key. | The exact same safe-harbor key cannot be filed by `FILE_SUIT`; honoring both requirements is impossible. This keeps the contract's fail-closed safe-harbor rule intact. |
| GLSim finality queue | WP-C6 requests a finalized callback lifecycle and effect recovery. | The test invokes `recover_case_effects` after read-back shows a callback is missing. | The installed local GLSim engine dispatches one queued post-message and drops remaining queued messages. Recovery is part of the spec and confirms idempotency; this does not prove live-network callback scheduling. |

## Open questions for Claude
1. For WP-C6 step 3, should the scenario keep the WP-C4 exclusion for safe-harbor keys (as implemented), or should the spec define another eligible non-officeholder case that can produce a summary?

## Risk notes
- Five-validator runs use local GLSim with mocked LLM responses. They do not prove live consensus, appeal/finality scheduling, or StudioNet fees.
- The integration confirms the Court case, CaseLaw holding, and Republic callback state through read-back. It does not deploy contracts to a public network.
- The local GLSim one-post limitation is simulation-specific; confirm the callback queue behavior against the live protocol during the live-release phase.

## Full verification output
```text

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() check contracts/AutonomousRepublic.py

✓ Lint passed (3 checks)
✓ Validation passed
  Contract: AutonomousRepublic
  Methods: 35 (19 view, 16 write)

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() typecheck contracts/AutonomousRepublic.py
Type checking AutonomousRepublic.py...

✓ No type errors found

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() check contracts/CaseLaw.py

✓ Lint passed (3 checks)
✓ Validation passed
  Contract: CaseLaw
  Methods: 6 (4 view, 2 write)

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() typecheck contracts/CaseLaw.py
Type checking CaseLaw.py...

✓ No type errors found

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() check contracts/RepublicCourt.py

✓ Lint passed (3 checks)
✓ Validation passed
  Contract: RepublicCourt
  Methods: 12 (5 view, 7 write)

> C:\Users\leoki\anaconda3\python.exe -X utf8 -c from genvm_linter.cli import cli; cli() typecheck contracts/RepublicCourt.py
Type checking RepublicCourt.py...

✓ No type errors found

> C:\Users\leoki\anaconda3\python.exe -m pytest tests/direct -q
INFO: File `gltest.config.yaml` found in the current directory, using it
INFO: Clearing artifacts directory: artifacts\gltest
INFO: Using the following configuration:
INFO:   RPC URL: http://127.0.0.1:4000/api
INFO:   Selected Network: localnet
INFO:   Available networks: ['localnet', 'studionet', 'testnet_bradbury']
INFO:   Selected chain type: localnet
INFO:   Available chains: localnet, studionet, testnet_asimov, testnet_bradbury
INFO:   Contracts directory: contracts
INFO:   Artifacts directory: artifacts\gltest
INFO:   Environment: .env
INFO:   Default wait interval: 3000 ms
INFO:   Default wait retries: 50
INFO:   Leader only mode: False
........................................................................ [ 80%]
..................                                                       [100%]
90 passed in 22.27s

> C:\Users\leoki\anaconda3\python.exe C:\Users\leoki\Genlayer\Loophole\tests\run_glsim.py --port 4000 --validators 5
INFO:     Started server process [25692]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:4000 (Press CTRL+C to quit)

> C:\Users\leoki\anaconda3\Scripts\gltest.EXE tests/integration/test_loophole_glsim.py -v -s --network localnet
INFO: File `gltest.config.yaml` found in the current directory, using it
INFO: Clearing artifacts directory: artifacts\gltest
INFO: Using the following configuration:
INFO:   RPC URL: http://127.0.0.1:4000/api
INFO:   Selected Network: localnet
INFO:   Available networks: ['localnet', 'studionet', 'testnet_bradbury']
INFO:   Selected chain type: localnet
INFO:   Available chains: localnet, studionet, testnet_asimov, testnet_bradbury
INFO:   Contracts directory: contracts
INFO:   Artifacts directory: artifacts\gltest
INFO:   Environment: .env
INFO:   Default wait interval: 3000 ms
INFO:   Default wait retries: 50
INFO:   Leader only mode: False
============================= test session starts =============================
platform win32 -- Python 3.13.9, pytest-9.1.1, pluggy-1.5.0 -- C:\Users\leoki\anaconda3\python.exe
cachedir: .pytest_cache
rootdir: C:\Users\leoki\Genlayer\Loophole
configfile: pytest.ini
plugins: anyio-4.10.0, genlayer-test-0.29.2
collecting ... collected 2 items

tests/integration/test_loophole_glsim.py::test_republic_v7_five_validator_lifecycle_reaches_consensus INFO:     127.0.0.1:63387 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63388 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63389 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63390 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63391 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63392 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63393 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63395 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63396 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63397 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63398 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63399 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63400 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63401 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63402 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63403 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63404 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63405 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63406 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63407 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63408 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63409 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63410 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63411 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63412 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63413 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63414 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63415 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63416 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63417 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63418 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63419 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63420 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63421 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63422 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63423 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63424 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63425 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63426 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63427 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63428 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63429 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63430 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63431 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63432 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63433 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63434 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63435 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63436 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63437 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63438 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63439 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63440 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63441 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63442 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63443 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63444 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63445 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63446 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63447 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63448 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63449 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63450 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63451 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63452 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63453 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63454 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63455 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63456 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63457 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63458 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63459 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63460 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63461 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63462 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63463 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63464 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63465 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63466 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63467 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63468 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63469 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63470 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63471 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63472 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63473 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63474 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63475 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63476 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63477 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63478 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63479 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63480 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63481 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63482 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63483 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63484 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63485 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63486 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63487 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63488 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63489 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63490 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63491 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:63492 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52077 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52078 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52079 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52080 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52081 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52082 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52083 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52084 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52085 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52086 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52087 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52088 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52089 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52090 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:52091 - "POST /api HTTP/1.1" 200 OK
PASSED
tests/integration/test_loophole_glsim.py::test_three_contract_caselaw_court_file_suit_lifecycle INFO:     127.0.0.1:57240 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57241 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57242 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57243 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57244 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57245 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57246 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57247 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57248 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57249 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57250 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57251 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57252 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57253 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57254 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57255 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57256 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57257 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57258 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57259 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57260 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57261 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57262 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57263 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57264 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57265 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57266 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57267 - "POST /api HTTP/1.1" 200 OK
TRACE caselaw.set_court: 0x0000000000000000000000000000000000000000000000000000000000000015 -> FINALIZED -> {'breach_count': 0, 'compliant_count': 0, 'contract_version': '1.0.0', 'court_address': addr#85b7a852706d3ce0b52fe61b13d153d449860e12, 'holding_count': 0, 'policy_version': 'LOOPHOLE_CASE_LAW_V1', 'safe_harbor_count': 0}
INFO:     127.0.0.1:57268 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57269 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57270 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57271 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57272 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57273 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57274 - "POST /api HTTP/1.1" 200 OK
TRACE republic.set_links: 0x0000000000000000000000000000000000000000000000000000000000000016 -> FINALIZED -> True
INFO:     127.0.0.1:57275 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57276 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57277 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57278 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57279 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57280 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57281 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57282 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57283 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57284 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57285 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57286 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57287 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57288 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57289 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57290 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57291 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57292 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57293 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57294 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57295 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57296 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57297 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57298 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57299 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57300 - "POST /api HTTP/1.1" 200 OK
TRACE law v1 enacted: 0x0000000000000000000000000000000000000000000000000000000000000018 -> FINALIZED -> {'certification': 'ADJUDICABLE', 'certification_quote': 'No faction may UNDERMINE a faction that holds public office.', 'closes_after_round': 3, 'constitutional': False, 'effective_from_round': 5, 'effective_until_round': 0, 'law_id': 1, 'law_kind': 'STATUTE', 'oppose_votes': 0, 'parent_law_id': 0, 'proposed_round': 1, 'resolved_round': 3, 'sponsor_faction_id': 'REFORMERS', 'status': 'ENACTED', 'support_votes': 4, 'text': 'No faction may UNDERMINE a faction that holds public office.', 'title': 'Officeholder Protection', 'veto_deadline_round': 4}
INFO:     127.0.0.1:57301 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57302 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57303 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57304 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57305 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57306 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57307 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57308 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57309 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57310 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57311 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57312 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57313 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57314 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57315 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57316 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57317 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57318 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57319 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57320 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57321 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57322 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57323 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57324 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.is_active_faction_controller() → OK (result type=bool)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
INFO:     127.0.0.1:57325 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57326 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57327 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57328 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57329 - "POST /api HTTP/1.1" 200 OK
TRACE human non-officeholder suit filed: 0x000000000000000000000000000000000000000000000000000000000000001e -> FINALIZED -> BRIEFING
INFO:     127.0.0.1:57330 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57331 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57332 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.is_active_faction_controller() → OK (result type=bool)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
INFO:     127.0.0.1:57333 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57334 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57335 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57336 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57337 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57338 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[PostMessage] enqueueing record_holding to Address("0x72c1bBcc8401B92c745e893FE2f6c473BBC14aE7")
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing record_holding on 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] record_holding completed OK
INFO:     127.0.0.1:57339 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57340 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57341 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57342 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57343 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57344 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57345 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57346 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57347 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57348 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57349 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_case_outcome() → OK (result type=str)
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing apply_case_outcome on 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] apply_case_outcome completed OK
INFO:     127.0.0.1:57350 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57351 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57352 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57353 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57354 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57355 - "POST /api HTTP/1.1" 200 OK
TRACE NOT_COVERED finalized: 0x0000000000000000000000000000000000000000000000000000000000000020 -> FINALIZED -> {'holding': {'action_type': 'UNDERMINE', 'case_id': 1, 'key': '1|UNDERMINE|LAW_SPONSOR', 'label': 'NOT_COVERED', 'law_id': 1, 'quote': 'No faction may UNDERMINE a faction that holds public office.', 'recorded_at': 1787775090, 'ruling_digest': 'b285687a82b257dcb6d4380e06eea784c42a2a9d042de499f2b1b9f1d5e8474b', 'target_class': 'LAW_SPONSOR'}, 'outcome': '{"action_key":"5:TRADITIONALISTS","action_round":5,"case_id":1,"defendant_faction_id":"TRADITIONALISTS","effects":"NO_VIOLATION_APPLIED","plaintiff_faction_id":"REFORMERS","ruling_digest":"b285687a82b257dcb6d4380e06eea784c42a2a9d042de499f2b1b9f1d5e8474b","sanction":"NONE","verdict":"NO_VIOLATION"}'}
INFO:     127.0.0.1:57356 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57357 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57358 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.is_active_faction_controller() → OK (result type=bool)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
INFO:     127.0.0.1:57359 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57360 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57361 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57362 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57363 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57364 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57365 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57366 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57367 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[PostMessage] enqueueing record_holding to Address("0x72c1bBcc8401B92c745e893FE2f6c473BBC14aE7")
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing record_holding on 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] record_holding completed OK
INFO:     127.0.0.1:57368 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57369 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57370 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57371 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57372 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57373 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57374 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57375 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57376 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57377 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_case_outcome() → OK (result type=str)
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing apply_case_outcome on 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] apply_case_outcome completed OK
INFO:     127.0.0.1:57378 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57379 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57380 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57381 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57382 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57383 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57384 - "POST /api HTTP/1.1" 200 OK
TRACE officeholder breach finalized: 0x0000000000000000000000000000000000000000000000000000000000000023 -> FINALIZED -> {"action_key":"5:REVOLUTIONARIES","action_round":5,"case_id":2,"defendant_faction_id":"REVOLUTIONARIES","effects":"VIOLATION_APPLIED","plaintiff_faction_id":"REFORMERS","ruling_digest":"1a834b787b2d0fe9496b76add6b141ec2b8b3d2bdf69ba872591b4879dfcf8ee","sanction":"REPRIMAND","verdict":"VIOLATION"}
INFO:     127.0.0.1:57385 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57386 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57387 - "POST /api HTTP/1.1" 200 OK
[PostMessage] enqueueing file_case_from_republic to Address("0x85b7A852706D3cE0b52FE61B13d153d449860e12")
[PostMessage DRAIN] executing file_case_from_republic on 0x85b7a852706d3ce0b52fe61b13d153d449860e12 (sender=0x7ec346463dfde2cdc2309efcaa4a538279f92fd8)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] file_case_from_republic completed OK
INFO:     127.0.0.1:57388 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57389 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57390 - "POST /api HTTP/1.1" 200 OK
[PostMessage DRAIN] executing apply_case_outcome on 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] apply_case_outcome completed OK
INFO:     127.0.0.1:57391 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57392 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57393 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57394 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57395 - "POST /api HTTP/1.1" 200 OK
TRACE AI FILE_SUIT summary: (nested transaction) -> FINALIZED -> {'case_id': 3, 'status': 'SUMMARY', 'label': 'COVERED_BREACH'}
INFO:     127.0.0.1:57396 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57397 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57398 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57399 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57400 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57401 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57402 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57403 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57404 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57405 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57406 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57407 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57408 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57409 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57410 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57411 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57412 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57413 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57414 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57415 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57416 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57417 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57418 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57419 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57420 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57421 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57422 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57423 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57424 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57425 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57426 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57427 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57428 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57429 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57430 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57431 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57432 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.is_active_faction_controller() → OK (result type=bool)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
INFO:     127.0.0.1:57433 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57434 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57435 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57436 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57437 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57438 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.is_active_faction_controller() → OK (result type=bool)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_faction() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_round_action() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_law() → OK (result type=dict)
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
INFO:     127.0.0.1:57439 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57440 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57441 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57442 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57443 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57444 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57445 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_game() → OK (result type=dict)
[PostMessage] enqueueing record_holding to Address("0x72c1bBcc8401B92c745e893FE2f6c473BBC14aE7")
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing record_holding on 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] record_holding completed OK
INFO:     127.0.0.1:57446 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57447 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57448 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57449 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57450 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57451 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57452 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57453 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57454 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57455 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_case_outcome() → OK (result type=str)
[PostMessage] enqueueing apply_case_outcome to Address("0x7ec346463DfDE2cDC2309EfCAA4A538279f92fD8")
[PostMessage DRAIN] executing apply_case_outcome on 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8 (sender=0x85b7a852706d3ce0b52fe61b13d153d449860e12)
[PostMessage DRAIN] apply_case_outcome completed OK
INFO:     127.0.0.1:57456 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57457 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57458 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57459 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57460 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57461 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57462 - "POST /api HTTP/1.1" 200 OK
TRACE v2 first impression: 0x000000000000000000000000000000000000000000000000000000000000002d -> FINALIZED -> {'action_type': 'UNDERMINE', 'case_id': 4, 'key': '2|UNDERMINE|LAW_SPONSOR', 'label': 'COVERED_BREACH', 'law_id': 2, 'quote': 'No faction may UNDERMINE any other faction.', 'recorded_at': 1787775870, 'ruling_digest': 'b5fc0d7e7825f89e0d3fb4cdbd1c9c95eca1af812f627a867de6e16015037d92', 'target_class': 'LAW_SPONSOR'}
INFO:     127.0.0.1:57463 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57464 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57465 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57466 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57467 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57468 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57469 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57470 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57471 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57472 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57473 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57474 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57475 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57476 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57477 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57478 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57479 - "POST /api HTTP/1.1" 200 OK
[cross-contract] 0x72c1bbcc8401b92c745e893fe2f6c473bbc14ae7.get_holding() → OK (result type=dict)
[cross-contract] 0x7ec346463dfde2cdc2309efcaa4a538279f92fd8.get_case_outcome() → OK (result type=str)
INFO:     127.0.0.1:57480 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57481 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57482 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57483 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57484 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57485 - "POST /api HTTP/1.1" 200 OK
INFO:     127.0.0.1:57486 - "POST /api HTTP/1.1" 200 OK
PASSED

============================== 2 passed in 9.31s ==============================

> npm.cmd run check

> loophole-web@1.0.0 check
> npm run lint && npm run typecheck && npm run test && npm run build


> loophole-web@1.0.0 lint
> eslint .


> loophole-web@1.0.0 typecheck
> tsc --noEmit


> loophole-web@1.0.0 test
> vitest run

2:10:50 AM [vite] warning: `esbuild` option was specified by "vite:react-babel" plugin. This option is deprecated, please use `oxc` instead.
2:10:50 AM [vite] warning: `optimizeDeps.esbuildOptions` option was specified by "vite:react-babel" plugin. This option is deprecated, please use `optimizeDeps.rolldownOptions` instead.
Both esbuild and oxc options were set. oxc options will be used and esbuild options will be ignored. The following esbuild options were set: `{ jsx: 'automatic', jsxImportSource: undefined }`

 RUN  v4.1.11 C:/Users/leoki/Genlayer/Loophole/web


 Test Files  6 passed (6)
      Tests  36 passed (36)
   Start at  02:10:51
   Duration  2.61s (transform 1.46s, setup 0ms, import 3.31s, tests 100ms, environment 2ms)


> loophole-web@1.0.0 build
> next build

▲ Next.js 16.3.3 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 110ms

  Creating an optimized production build ...
✓ Compiled successfully in 780ms
  Running TypeScript ...
  Finished TypeScript in 6.4s ...
  Collecting page data using 11 workers ...
  Generating static pages using 11 workers (0/8) ...
  Generating static pages using 11 workers (2/8) 
  Generating static pages using 11 workers (4/8) 
  Generating static pages using 11 workers (6/8) 
✓ Generating static pages using 11 workers (8/8) in 780ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/cron/advance
├ ƒ /api/health
├ ƒ /api/republic/state
├ ○ /apple-icon.png
├ ○ /how-to-play
├ ○ /icon.png
└ ○ /manifest.webmanifest


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand


> npm.cmd run check

> loophole-keeper-scheduler@0.1.0 check
> npm run types && npm run typecheck && npm test && npm run deploy:dry


> loophole-keeper-scheduler@0.1.0 types
> wrangler types


 ⛅️ wrangler 4.126.0 (update available 4.151.1)
───────────────────────────────────────────────
Generating project types...

interface __BaseEnv_Env {
	KEEPER_URL: "https://loophole-zeta.vercel.app/api/cron/advance";
}
declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/index");
	}
	interface Env extends __BaseEnv_Env {}
}
interface Env extends __BaseEnv_Env {}
type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};
declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, "KEEPER_URL">> {}
}

Generating runtime types...

Runtime types generated.


✨ Types written to worker-configuration.d.ts

📖 Read about runtime types
https://developers.cloudflare.com/workers/languages/typescript/#generate-types
📣 Remember to rerun 'wrangler types' after you change your wrangler.jsonc file.


> loophole-keeper-scheduler@0.1.0 typecheck
> tsc --noEmit


> loophole-keeper-scheduler@0.1.0 test
> vitest run


 RUN  v4.1.11 C:/Users/leoki/Genlayer/Loophole/scheduler


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  02:11:20
   Duration  3.92s (transform 66ms, setup 0ms, import 100ms, tests 30ms, environment 1ms)


> loophole-keeper-scheduler@0.1.0 deploy:dry
> wrangler deploy --dry-run


 ⛅️ wrangler 4.126.0 (update available 4.151.1)
───────────────────────────────────────────────
Total Upload: 5.04 KiB / gzip: 1.76 KiB
Your Worker has access to the following bindings:
Binding                                                          Resource                  
env.KEEPER_URL ("https://loophole-zeta.vercel.app/api/...")      Environment Variable      

--dry-run: exiting now.

Loophole verification passed.
```
