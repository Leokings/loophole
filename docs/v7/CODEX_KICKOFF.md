# Prompts to paste into Codex

Open Codex in `C:\Users\leoki\Genlayer\Loophole`. Codex reads `AGENTS.md` automatically. Paste one prompt per phase, and start the next phase only after Claude signs off on the previous report.

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
I pushed v7 and approve the StudioNet release. It is just after 00:00 UTC. Run WP-D2 (probe), WP-D1 (deploy), WP-D3 (live demo), WP-D4 (proof.json + verify:proof) and WP-D5 (budget measurement). Stop immediately on any unexpected judgment and report it. Do not touch Vercel. Write docs/v7/reports/PHASE_5B.md and stop.
```

---

## After each phase
Tell Claude: **"review phase <n>"**. Claude reads the report and the `v7` diff and replies with must-fix and optional items. Paste the must-fix list back into Codex:

```
Apply these review fixes from Claude on branch v7, one commit per item, rerun the checks, and append a "Fixes" section to the same phase report:
<paste list>
```
