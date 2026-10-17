# Phase 4 report

## Summary

The V7 web app reads the republic, CaseLaw, and court contracts, presents the Chamber and a case Docket, and provides a public read-only Case law registry.
The keeper now follows the operation queues reported by each contract, including delayed recovery of missing court callbacks.
Transactions have distinct submitted, pending, accepted, and final states; pending state resumes after a reload.
The guide explains law certification, free stances, crisis judgments, suits, safe harbors, and seasons.
The app remains in demonstration mode unless contract addresses are configured; no live wallet or network flow was exercised in this phase.

## Work packages

| WP | Commit | Status | Notes |
| --- | --- | --- | --- |
| F1 | `0d0b126` | done | Contract-reported keeper operations, per-contract write cap, and heartbeat handling. |
| F2 | `76f9fee` | done | V7 snapshot, CaseLaw reads, write wrappers, and demonstration records. Final QA also bounded parallel reads and preserved frozen law evidence. |
| F3 | `549762b` | done | Chamber law certification, stance selectors, crisis results, and source-aware round summaries. |
| F4 | `e784178` | done | Court tab is the Docket, with one-law suit filing, briefs, status, recovery hints, and no appeal controls. |
| F5 | `a726f79` | done | Public `/case-law` registry grouped by law version, including quotes, safe harbors, originating cases, and amendment lineage. |
| F6 | `549d3e5` | done | Transaction finality tracking, persistent pending records, and optional recorded-proof panel. |
| F7 | `182db82` | done | User guide, stable demo timestamps, hydration fixes, responsive browser check, and screenshots. |

## Tests

- `python scripts/verify.py --integration` — passed. Contract lint, validation, and type checks passed; **97 direct tests passed**; both **five-validator GLSim integration tests passed**; web check passed (lint, typecheck, **38 tests**, production build); scheduler check passed (typecheck, **5 tests**, dry-run deploy). Final verifier output: `Loophole verification passed.`
- `npm run check` in `web/` — passed: lint, typecheck, **38 tests across 7 files**, and optimized Next.js production build.
- Browser review used demo data at desktop 1440 px and mobile 375 px. Chamber and Case law pages loaded without hydration or runtime errors. Screenshots:
  - [Chamber, desktop](phase4-desktop.png)
  - [Chamber, mobile 375 px](phase4-mobile.png)
  - [Case law, desktop](phase4-case-law-desktop.png)
  - [Case law, mobile 375 px](phase4-case-law-mobile.png)
- Named tests added or updated:
  - WP-F1: `executes keeper ops in priority order up to the per-tick cap`; `stops a contract at the first deferred op`; `reads keeper status once per contract`; `waits for the keeper when status lists pending ops outside a due phase`.
  - WP-F5: `splits law text around an exact quote`; `returns plain text when the quote is absent`; `keeps the whole law as plain text when no quote is supplied`.
  - WP-F6: `accepts finalized consensus with successful execution`; `maps accepted transactions separately from transactions still processing`; `rejects a finalized transaction that consensus did not accept`; secret-retention tests cover uncertain receipts and reload-safe commit secrets.

## Deviations from spec

| Spec section | What the spec said | What I did | Why |
| --- | --- | --- | --- |
| WP-F2 holdings read | Read CaseLaw holdings for enacted law IDs. | Read holdings for retained law IDs, including superseded/repealed versions. | Older holdings remain permanent and the public registry must continue to show them under their original law version. |
| WP-F4 transaction links | Show Explorer links for each case's transactions. | Link the current browser's filing transaction when available and link the Court and Republic contracts. | The public case getter does not include transaction hashes for historical filings by other users; a transaction indexer/event source would be needed to create reliable per-case links. |
| WP-F6 proof panel | Render the manifest when `web/public/proof.json` exists and hide it otherwise. | Implemented the optional panel; no proof manifest is present, so it remains hidden. | Phase 5 creates the live proof file. A missing-file request returns 404 in the browser network log but does not surface in the UI. |

## Open questions for Claude

1. Confirm whether the historical Explorer-link limitation should be addressed in a later phase with an indexed transaction source.

## Risk notes

- Contract reads, wallet actions, write polling, and transaction Explorer links were not tested against a live network or real browser wallet. GLSim verifies the contracts, not the browser transaction flow.
- The deployed app must set `NEXT_PUBLIC_REPUBLIC_ADDRESS`, `NEXT_PUBLIC_COURT_ADDRESS`, and `NEXT_PUBLIC_CASELAW_ADDRESS` together for live mode. The public Vercel release remains a separate owner-approved Phase 5 step.
- The proof panel will stay hidden until a verified `web/public/proof.json` is produced. Its absence does not mean the displayed demonstration records are live evidence.
- Vite emitted existing `esbuild` deprecation warnings during tests; they did not fail the checks.

No push or deployment was performed.

## Fixes

Phase 4 review findings were addressed on `v7` in separate commits:

| Review item | Commit | Resolution |
| --- | --- | --- |
| Must-fix 1: bound snapshot reads | `13e75d3`, `bb187c5` | Added aggregate Republic and Court views and switched the browser to a bounded snapshot helper. The old-world named test simulates 520 laws and 80 cases and enforces at most 8 RPC calls; `/api/health` uses the shared cache. |
| Must-fix 2: contract-valid demo fixture | `5342745` | Rebuilt demo cases around effective law versions, real target classes, valid holding origins, summary and stay invariants, and the Court's rule-text template. |
| Must-fix 3: mobile crisis layout | `822b4cd` | Stacked the crisis details at narrow widths, made the top navigation horizontally scrollable, and recaptured the production-built 375 px Chamber screenshot at [phase4-mobile.png](phase4-mobile.png). |
| Optional: contract-derived suit targets | `dffe793`, `a19d90f` | The Court now reads the contract-calculated suit target class and key; the browser no longer derives them itself. CaseLaw reads are grouped within the bounded 64-law contract limit. |

**Additional tests:** `snapshot reads stay bounded for an old world`; `demo fixture obeys contract invariants`; the direct CaseLaw retained-law limit test; and snapshot/demo Vitest suites passed. After the optional suit-target change, final verification passed: 97 direct tests, 2 five-validator GLSim integration tests, 45 web tests across 10 files with lint/typecheck/production build, and 5 scheduler tests plus dry-run deploy. `Loophole verification passed.` The old-world test models exactly 520 laws and 80 retained cases, and the final 375 px production screenshot was recaptured and visually checked.

**Fixture numbering detail:** the contract allocates a law ID to the vague proposal before its `UNADJUDICABLE` decision. Therefore the safe-harbor rule follows as law #2 in the demo fixture, rather than #1 in the review's suggested story. The cited law IDs, effective rounds, target classes, and holdings now agree with contract behavior.
