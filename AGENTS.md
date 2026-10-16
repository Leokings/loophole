# Loophole — instructions for coding agents

Loophole V7 follows a split workflow: **Claude designs and reviews; Codex builds.**
The owner runs both agents and relays results between them.

## Before you write any code
1. Read [`docs/v7/README.md`](docs/v7/README.md): the workflow, rules, phase order and report template.
2. Read the phase spec you were asked to build (`docs/v7/PHASE_*.md`).
3. Read the design rationale in [`docs/MILESTONE_V7_DESIGN.md`](docs/MILESTONE_V7_DESIGN.md). Where they differ, the phase spec wins.
4. Read both GenLayer guides one directory up:
   - `../GENLAYER_PORTAL_SUBMISSION_GUIDE.md` (contract and consensus standard)
   - `../GENLAYER_PORTAL_PROJECT_GUIDE.md` (project, evidence and Portal standard)

## Hard rules
- Build only the phase you were asked to build, on the `v7` branch. Commit one work package per commit. **Never push, merge to `main`, deploy to Vercel, change repo visibility, or submit to the Portal** unless the owner explicitly tells you to in that session.
- Do not edit `docs/MILESTONE_V7_DESIGN.md` or any `docs/v7/PHASE_*.md` spec. If the spec is wrong or impossible, implement the closest safe behavior and record the deviation in your phase report.
- The LLM never sets numbers, outcomes or payouts. It returns a closed label (plus a verbatim quote where the spec requires one); deterministic code derives every consequence.
- Every nondeterministic block must have a deterministic, fail-closed path when it never reaches consensus (deadline + fallback).
- Snapshot storage into locals before `leader_fn` / `validator_fn`; never touch `self` inside them.
- Keep the pinned runner header line 1 of every contract unchanged unless the spec says otherwise.
- `.py` contract files use LF line endings.
- The production keeper key and `CRON_SECRET` are never needed for building or testing. Never print or commit secrets. StudioNet probe deploys, when a spec allows them, use a throwaway key.

## Verification you must run before reporting
```
python scripts/verify.py              # lint + typecheck contracts, direct tests, web + scheduler checks
python scripts/verify.py --integration  # adds the five-validator GLSim scenario (required at phase end)
```

## When you finish a phase
Write `docs/v7/reports/PHASE_<n>.md` using the template in `docs/v7/README.md`. Then stop. The owner will take the report to Claude for review.
