# Loophole V7 build handoff

**Roles**
- **Claude** wrote the design ([`../MILESTONE_V7_DESIGN.md`](../MILESTONE_V7_DESIGN.md)) and these build specs, and reviews each finished phase.
- **Codex** implements one phase at a time on the `v7` branch, then writes a phase report.
- **The owner** relays work between them, approves every outward-facing step (push, Vercel deploy, StudioNet release, Portal submission), and submits to the Portal personally.

## Phase order

| Phase | Spec | Delivers | Stop after? |
| --- | --- | --- | --- |
| 0 | — | Keeper pacing, `/api/health`, heartbeat badge. **Already built by Claude and deployed 2026-10-16** | — |
| 1 + 2 | [`PHASE_1_2_REPUBLIC.md`](PHASE_1_2_REPUBLIC.md) | Republic V7: bounded history, legal-option menu + per-faction fallback, free vote stances, law certification, crisis split with narrow judgments, season reset, keeper status view | **Yes** — Claude reviews |
| 3 | [`PHASE_3_CASELAW_COURT.md`](PHASE_3_CASELAW_COURT.md) | New `CaseLaw` contract, Court V5 (one law per case, label + verbatim quote, summary dispositions, stays, expiry), `FILE_SUIT`, finality callbacks | **Yes** — Claude reviews |
| 4 | [`PHASE_4_5_FRONTEND_RELEASE.md`](PHASE_4_5_FRONTEND_RELEASE.md) §A | Frontend, V7 keeper, Case Law page | **Yes** — Claude reviews |
| 5 | [`PHASE_4_5_FRONTEND_RELEASE.md`](PHASE_4_5_FRONTEND_RELEASE.md) §B | Deploy scripts, live demo runner, `deploy/proof.json`, `verify:proof`, docs and Portal fields | **Yes, twice:** before the live deploy (owner go-ahead), and after the demo (Claude reviews evidence) |

## Rules that apply to every phase
1. **Branch:** create `v7` from the current `main` once. Commit one work package per commit. Message format: `V7 <WP-id>: <summary>`.
2. **Specs are the contract.** When the spec gives an exact constant, name, error code, prompt fragment or JSON shape, use it exactly. When it doesn't, follow the surrounding code's style.
3. **Deviation protocol:** if something in a spec is impossible, unsafe, or contradicts the GenLayer SDK, do the closest safe thing and record it under "Deviations" in the report. Don't silently redesign.
4. **SDK truth:** never invent GenLayer SDK methods. The SDK the direct tests load lives under `~/.cache/gltest-direct/extracted/v0.2.16/`. Confirm APIs there. Example: `TreeMap.__delitem__` exists in `genlayer/py/storage/tree_map.py`.
5. **Tests:** every work package lists its required tests. Name each test exactly as given, or as close as possible.
   - Direct tests mock the LLM with `direct_vm.mock_llm(regex, json)`.
   - Every prompt must begin with a unique, stable sentence that the tests can match.
6. **Consensus pattern (applies everywhere unless a spec says otherwise):**
   - The leader returns canonical JSON.
   - The validator canonicalizes the leader result with the same deterministic function, runs its own independent LLM judgment, and **requires exact equality of every stored field** (or of the label, plus a deterministic check of the quote).
   - Any `gl.vm.UserError` inside the validator means `return False`.
7. **Error codes:** use `_expected("CODE")` for caller errors and `_llm("CODE")` for model-output errors, as in V6.
8. **Storage budget:** StudioNet allows about 256 MiB of snapshot writes per contract per UTC day, and each write costs roughly the size of the whole contract state. Never add unbounded on-chain collections.

## Phase report template (`docs/v7/reports/PHASE_<n>.md`)

```markdown
# Phase <n> report

## Summary
<3–6 lines: what now works>

## Work packages
| WP | Commit | Status (done / partial / skipped) | Notes |

## Tests
- Commands run and their final lines (pass/fail counts). Paste failures verbatim.
- New test names, grouped by WP.

## Deviations from spec
| Spec section | What the spec said | What I did | Why |

## Open questions for Claude
<numbered; empty is fine>

## Risk notes
<consensus risks, budget/size measurements, anything mocked that must be proven live>
```

## Review loop
1. Codex finishes a phase and writes its report.
2. The owner tells Claude: "review phase <n>".
3. Claude reads the report and the `v7` diff against the spec, then returns findings: must-fix vs. optional.
4. Codex fixes the must-fix items in follow-up commits and appends a "Fixes" section to the same report.
5. Repeat until Claude signs off, then start the next phase.
