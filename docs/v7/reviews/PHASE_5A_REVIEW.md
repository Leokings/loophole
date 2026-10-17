# Claude review — Phase 4 fixes and Phase 5A (release preparation)

Reviewed 2026-10-17 on branch `v7` at `05b938f`.

## Verdict
The Phase 4 fixes (`13e75d3` … `bb187c5`) are **confirmed and closed**:
- snapshot views capped at 8 calls for an old world
- a contract-valid demo fixture with an invariant test
- a fixed mobile layout
- contract-derived suit targets

Your note on the fixture is right: the vague proposal takes the first law ID.

**Phase 5A is approved once the four must-fix items below land.** After that the release is gated only on the owner: push `v7`, then give the go-ahead to start Phase 5B just after 00:00 UTC.

**Independently re-verified:** I ran `python scripts/verify.py --integration` on `05b938f`.
- All contracts lint, validate and typecheck clean.
- Direct tests: 97 passed. GLSim: 2 passed.
- Web: 45 passed + build. Scheduler: 5 passed + dry run.

**What's good:**
- `deploy-loophole.mjs` is exactly what the guides ask for:
  - probe first
  - clean `v7` checkout whose HEAD is on a remote
  - CR-byte refusal
  - schema preflight for all four contracts
  - transaction hashes saved before polling
  - byte-equal source read-back
  - a deployer key separate from the keeper key
  - the ≥3×-slot timing guard, with tests
- The proof assembler and verifier are read-only and keep the recorded-vs-live separation.
- The docs are honest that no V7 live proof exists yet.

## Must-fix

### 1. Implement the demo as a code-defined scenario
`web/scripts/run-v7-demo.mjs` currently replays a static JSON call list. The demo needs phase waits, commit → reveal with nonces, live office reads, certification before resolution, finality-gated case filing and a 3-hour fallback wait, and a static list can't express those. You flagged this correctly.

I wrote the authoritative scenario: **`docs/v7/PHASE_5_DEMO_SCENARIO.md`**. Implement it as `web/scripts/v7-demo-scenario.mjs` with the helpers it specifies:
- `waitForPhase` / `waitForRound` (15 s polling)
- `play(round, actions)` (preview → commit ×4 → reveal ×4 → advance)
- `assertTargetClass`
- `file` (logical case names, never hard-coded IDs)
- `awaitEffects` (records `multi_emit_delivered`, with recovery after 30 min)

Also implement:
- the accepted-vs-finalized rule (sequence on **ACCEPTED + leader SUCCESS**; require **FINALIZED** for every record before proof assembly)
- the influence check
- the stop rule

Keep `executeStep` as the recorder. Keep the `--confirm-live-studionet` gate.

**Tests (vitest, no network):** run the scenario against a mocked client that simulates phase progression and contract responses. Assert:
- the stage order
- that nonces are persisted before commits
- the stop-on-unexpected-label behavior (for example, case C returning `COVERED_BREACH` stops the run)
- that the fallback stage is last
- that `awaitEffects` records both the `multi_emit_delivered` outcomes

### 2. `runner.hash` comes from the contract header
**Answer to your question 2:** the runner identity is the pinned dependency on line 1 of every contract: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

Record:
- `runner: {"depends": "<that string>", "header_sha256": "<sha256 of line 1>"}`
- an assertion that all four sources (three contracts + probe) carry the identical line 1

The probe's FINALIZED + SUCCESS write/read is the network's confirmation that it accepts this runner. Don't call any SDK method for this.

### 3. Fix a factual error in the blog draft
`docs/BLOG_685_ROUNDS.md` says the other factions "had wealth between 900 and 920". The live V6 data (design doc §2) showed:
- Merchants: wealth **965**, lifetime 14,367
- the other three: wealth **0, 0 and 134**, lifetime **900, 920 and 3,170**

Correct the sentence. Re-check every other number in the blog against `docs/MILESTONE_V7_DESIGN.md` §2.

### 4. Fix README accuracy
- **"Run locally"** requires "Docker with Compose", but GLSim runs in-process (`tests/run_glsim.py` imports `glsim`). Remove Docker from the prerequisites, unless something else truly needs it; if so, name it.
- **Mermaid node** "Validators judge AI action batch and legality". Legality is checked by code; validators only audit for enumerated bad-faith violations. Rename it to "Code checks legality; validators audit the AI batch for bad-faith violations".
- **Mermaid node** "Validators judge each crisis response against the rubric". Rename it to "…against one success criterion (label + verbatim quote)".

## Optional
- **Per-faction influence.** Once Phase 5B produces the proof, add a one-line "Live demo (round-by-round)" table to the README linking each scenario stage to its proof entry. Leave it unfilled until then.

## Answers to your open questions
1. **Plan-driven runner:** not acceptable as the only form. See must-fix 1: the scenario is now specified in code-level detail, and the JSON-plan path can be removed or kept for small ad-hoc stages.
2. **`runner.hash`:** see must-fix 2.

## Phase 5B, part 2 (live) — what happens next
Do not start until the owner says so:
1. The owner pushes `v7`.
2. Run WP-D1 (probe + deploy) just after 00:00 UTC.
3. Run the scenario.
4. Run `assemble-proof` and `verify:proof`.
5. Record the WP-D5 budget measurement.
6. Write `docs/v7/reports/PHASE_5B.md` with the three gates.

The Vercel switch (WP-D6 hosting step) needs a **separate** owner approval after Claude reviews the evidence.
