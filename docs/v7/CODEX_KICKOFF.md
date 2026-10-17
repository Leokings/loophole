# Prompts to paste into Codex

Open Codex in `C:\Users\leoki\Genlayer\Loophole`. Codex reads `AGENTS.md` automatically.

There are two ways to run it:
- **All-in-one (below):** Codex builds Phases 1–4 plus the Phase 5 scripts and docs in one run, writing a report after each phase. Claude then reviews all the reports together. It's faster, but a design mistake found late costs more rework.
- **Phase by phase (further down):** paste one prompt per phase and start the next only after Claude signs off. This is safer.

Either way, the live StudioNet release and any Vercel change happen only after the owner says go.

## All-in-one build prompt

```
You are building Loophole V7 — the milestone upgrade — in this repository. Claude wrote the design and the build specs; your job is to implement all of it faithfully.

READ FIRST (do not write code before reading all of these):
- AGENTS.md
- docs/v7/README.md            (workflow, rules, report template)
- docs/MILESTONE_V7_DESIGN.md  (why: the live-world problems and the new mechanism)
- docs/v7/PHASE_1_2_REPUBLIC.md
- docs/v7/PHASE_3_CASELAW_COURT.md
- docs/v7/PHASE_4_5_FRONTEND_RELEASE.md
- ../GENLAYER_PORTAL_SUBMISSION_GUIDE.md and ../GENLAYER_PORTAL_PROJECT_GUIDE.md

WHAT TO BUILD, IN ORDER (branch `v7` from `main`, one commit per work package, message "V7 <WP-id>: <summary>"):
1. Phase 1+2 — AutonomousRepublic V7: WP-R0 … WP-R6
   (bounded history, legal-option menu with per-faction fallback, advance_round_fallback, free vote stances, sponsor support, law certification, crisis split with MET/NOT_MET/INSUFFICIENT judgments, full season reset, resource caps, legitimacy sources, get_keeper_status).
2. Phase 3 — new contracts/CaseLaw.py, RepublicCourt V5, FILE_SUIT: WP-C1 … WP-C6
   (one law per case, label + verbatim quote with exact label consensus, summary dispositions with no LLM call, stays, expiry, finality-callback holdings and outcomes, AI-seat lawsuits, safe harbors in the AI prompt, bounded court state, three-contract GLSim scenario).
3. Phase 4 — frontend + V7 keeper: WP-F1 … WP-F7 (read web/AGENTS.md first).
4. Phase 5 scripts and docs ONLY: WP-D1, WP-D2 (probe contract + script, not run), WP-D3 (demo runner script, not run), WP-D4 (proof + verify:proof scripts, not run), WP-D6 doc drafts.

QUALITY BAR:
- Specs are the contract: use exact names, constants, error codes, prompt opening sentences and JSON shapes.
- If something is impossible or unsafe, do the closest safe thing and record it under "Deviations" in that phase's report. Never silently redesign.
- Never invent GenLayer SDK methods; confirm them in ~/.cache/gltest-direct/extracted/v0.2.16/.
- The LLM never sets numbers or outcomes; every nondeterministic block has a deadline/fallback; snapshot storage into locals before leader/validator functions; no unbounded on-chain collections.
- Write every test the specs name. Don't weaken, skip or delete tests to get green.

CHECKPOINTS (do not skip):
- At the end of each phase, run `python scripts/verify.py --integration` (and `npm run check` in web/ for Phase 4). Fix all failures before moving on.
- Then write docs/v7/reports/PHASE_1.md, PHASE_3.md, PHASE_4.md and PHASE_5A.md using the report template, including the measurements each spec asks for.
- If a phase cannot reach green after a genuine effort, stop there, write its report with the failures pasted verbatim, and do not start the next phase.

HARD LIMITS:
- Do NOT push, merge to main, deploy to StudioNet or Vercel, change env vars, change repo visibility, or submit anything to the GenLayer Portal. The live release (Phase 5 part 2) happens only after the owner pushes `v7` and explicitly approves it, starting just after 00:00 UTC.
- Never print or commit secrets.

When everything is done (or you had to stop), finish with a short summary listing each phase as done / partial / blocked, the final test results, and the path of every report.
```

---

## Phase 1 + 2

```
Build Loophole V7 Phase 1+2 (AutonomousRepublic V7).

1. Read AGENTS.md, docs/v7/README.md, docs/v7/PHASE_1_2_REPUBLIC.md, docs/MILESTONE_V7_DESIGN.md, ../GENLAYER_PORTAL_SUBMISSION_GUIDE.md and ../GENLAYER_PORTAL_PROJECT_GUIDE.md before changing code.
2. Create branch v7 from main. Implement work packages WP-R0 to WP-R6 in order, one commit each ("V7 WP-R<n>: ...").
3. Before every SDK call you're unsure about, confirm it exists in ~/.cache/gltest-direct/extracted/v0.2.16/.
4. Run `python scripts/verify.py --integration` at the end. Fix failures; don't skip or weaken tests.
5. Write docs/v7/reports/PHASE_1.md using the template in docs/v7/README.md (include the WP-R1 size measurement and any deviations).
6. Stop. Do not push, deploy, or start Phase 3.
```

## Phase 3

```
Claude signed off on Phase 1+2. Build Phase 3 on branch v7 following docs/v7/PHASE_3_CASELAW_COURT.md (WP-C1 to WP-C6, one commit each). Run `python scripts/verify.py --integration`, write docs/v7/reports/PHASE_3.md, then stop. Do not push or deploy.
```

## Phase 4

```
Claude signed off on Phase 3. Build Phase 4 on branch v7 following docs/v7/PHASE_4_5_FRONTEND_RELEASE.md §A (WP-F1 to WP-F7). Read web/AGENTS.md first. Run `python scripts/verify.py --integration` and `npm run check` in web/, capture the screenshots it asks for, write docs/v7/reports/PHASE_4.md, then stop. Do not push or deploy.
```

## Phase 5, part 1 (scripts only)

```
Claude signed off on Phase 4. Implement docs/v7/PHASE_4_5_FRONTEND_RELEASE.md §B WP-D1, WP-D3 (script only), WP-D4 (scripts only) and WP-D6 doc drafts on branch v7. Do NOT deploy anything to StudioNet or Vercel yet. Write docs/v7/reports/PHASE_5A.md and stop.
```

## Phase 5, part 2 (live — only after the owner pushes v7 and says go)

```
I pushed v7 and approve the StudioNet release. It is just after 00:00 UTC, and GENLAYER_DEPLOYER_PRIVATE_KEY is set in web/.env.local.

1. From web/, run `npm run deploy:studionet` (probe first, then Republic → CaseLaw → Court → links, byte-equal source checks). If the probe or any deploy step fails, stop and report.
2. Run the live scenario from docs/v7/PHASE_5_DEMO_SCENARIO.md (Revision 2) with `node scripts/run-v7-demo.mjs <deployment-artifact> --confirm-live-studionet` (use the runner's documented arguments). It is resumable: if it stops for a network error, resume it. If it stops on a ScenarioStopError (unexpected label, verdict, sanction, class, influence or error code), do NOT retry or change prompts; record it and stop.
3. When the scenario completes, run the proof assembler and `npm run verify:proof`.
4. Record the WP-D5 storage measurements (`get_storage_stats` for all three contracts, plus any "this write costs N" values) and whether both finality messages were delivered per case (`multi_emit_delivered`).
5. Do not touch Vercel, the keeper, or the Portal. Write docs/v7/reports/PHASE_5B.md with the three gates (technical, distinctiveness, evidence), every tx hash, and anything that only GLSim proved. Then stop.
```

---

## After each phase
Tell Claude: **"review phase <n>"**. Claude reads the report and the `v7` diff and replies with must-fix and optional items. Paste the must-fix list back into Codex:

```
Apply these review fixes from Claude on branch v7, one commit per item, rerun the checks, and append a "Fixes" section to the same phase report:
<paste list>
```
