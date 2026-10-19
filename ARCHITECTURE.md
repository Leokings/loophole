# Loophole V7 architecture

## Contracts and authority

`AutonomousRepublic.py` is authoritative for faction state, legal actions, law lifecycle, bounded round history, elections, crises, seasons, and numeric consequences. Its `FILE_SUIT` action can request litigation only for a prior-round action and an effective, adjudicable law. Its public snapshot includes the current bounded world state and the contract-calculated suit targets.

`RepublicCourt.py` is authoritative for frozen case evidence and case lifecycle. A case binds one law version to one recorded action and its target class. At filing, it checks CaseLaw: an existing holding creates a code-only `SUMMARY`; an active deciding case makes the new case `STAYED`; otherwise it becomes `BRIEFING`. A novel case judgment is limited to a label and a verbatim quote. Contract code derives the disposition, sanction, key, and digest.

`CaseLaw.py` is the reusable, immutable registry. Only the linked court can record a holding. The key binds the law version, action type, and target class. Idempotent replays are safe; conflicting records are rejected. A `NOT_COVERED` holding is a safe harbor for that exact law version and key. Amending a law creates a new version; it does not mutate the old holding.

The browser reads aggregate views, displays evidence and case history, and asks a connected wallet to sign writes. It cannot decide cases or set numeric outcomes. The keeper reads each contract's bounded operation queue and submits only listed permissionless operations. It does not choose AI moves or court outcomes.

## Finality and cross-contract effects

```mermaid
sequenceDiagram
  participant U as Player or AI seat
  participant R as AutonomousRepublic
  participant C as RepublicCourt
  participant K as CaseLaw
  participant G as GenLayer finality
  U->>C: File one frozen action under one effective law
  C->>K: Read holding for the deterministic key
  alt Existing holding
    C->>C: Derive summary from stored label and quote; no LLM call
  else Novel key
    C->>C: Validators judge fixed label + verbatim quote
    C->>G: Submit ruling
    G-->>C: Finalized callback
    C->>K: Record immutable holding if label permits
    C->>R: Apply deterministic case outcome once
  end
```

The callback is the boundary between a proposed result and a permanent holding or consequence. Before finality, the case may show an accepted ruling with effects pending. `recover_case_effects` can re-emit missing idempotent callbacks. A stay is released only after a first holding arrives, or becomes the deciding case when the earlier attempt terminates without one. Deadline expiry is fail-closed and creates no holding or sanction.

## Trust boundaries

- Validators establish agreement on bounded semantic outputs. They do not independently prove the truth of arbitrary web claims.
- Quotes are checked against frozen law text; actions and target classes come from accepted contract state, not plaintiff prose.
- Deterministic code validates inputs, enforces effective dates and deadlines, derives verdicts and sanctions, and deduplicates effects.
- The UI labels live reads separately from a recorded proof manifest. A source hash shows byte identity to the recorded source; it does not prove the design is correct.
- Contract state, submitted case evidence, quotes, addresses, and transactions are public and persistent. Game resources are synthetic units, not financial assets.
