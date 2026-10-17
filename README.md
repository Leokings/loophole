# Loophole V7

Loophole is a strategy game where an autonomous republic makes laws and a separate court decides whether recorded actions fall under them. GenLayer validators assess a narrow question about frozen evidence: does one quoted rule cover one action against one target class? Once finalized, that answer becomes a binding holding. The same kind of case is then resolved from the registry without another model judgment. If the law leaves a gap, the safe harbor remains until the legislature amends the law.

## How a decision becomes precedent

```mermaid
flowchart TD
  P[Player or AI seat proposes an action] --> A[Code checks legality; validators audit the AI batch for bad-faith violations]
  A --> R[Republic applies deterministic effects]
  R --> L[Legislature proposes law]
  L --> C[Validators judge law certification: adjudicable or not]
  C --> V[Seats record free stances; contract counts votes]
  R --> CR[Crisis opens from bounded world evidence]
  CR --> CRJ[Validators judge each crisis response against one success criterion (label + verbatim quote)]
  R --> F[Frozen action + effective law filed as one case]
  F --> Q[Validators judge one label and a verbatim law quote]
  Q -->|native finality callback| H[CaseLaw stores immutable holding]
  H --> S[Later matching case: code-only summary]
  H --> M[Legislature may amend law; new law version gets a new key]
```

The AI proposes bounded choices. It does not set scores, sanctions, balances, or other numeric consequences. Contract code verifies choices, applies fixed effects, enforces deadlines, and records the result. The court uses a deterministic summary when CaseLaw already has the matching key (`law version | action type | target class`). A novel case gets a quote-checked judgment; an unclear or expired case creates no holding.

## Run locally

Use Python 3.12 and Node.js 22. Clone the repository, install Python requirements, install web dependencies with `npm ci` in `web/`, and run `python scripts/verify.py --integration` from the repository root. The contracts and GLSim integration tests run in process; Docker and Compose are not required for the local verification path. To open the demonstration UI, run `npm run dev` in `web/` and visit the local URL printed by Next.js. The page uses internally consistent sample records when no contract addresses are configured.

For a live read-only deployment, set the three V7 public contract addresses and the matching GenLayer network in the web environment. Wallet writes require a compatible wallet and user approval. Never put private keys in browser configuration. A live release also needs reviewed deployment and proof records; the deployment and demo scripts are intentionally gated and were not run as part of this source release.

## Evidence and limitations

`deploy/proof.json`, when produced by the separately approved live demo, is the record of deployment hashes, source hashes, finalized demo transactions, validator results, case links, and selected read-backs. The site renders these as recorded historical proof, separately from its current live reads. No V7 proof manifest is included yet. The existing V6 history is preserved in [CHANGELOG.md](CHANGELOG.md) and is historical evidence for V6 only.

V7's contract logic and local GLSim tests do not establish that a live StudioNet deployment or browser wallet flow has succeeded. Synthetic game resources are not real assets. Validators judge bounded evidence and do not make off-chain facts true. Public contract state and transaction history are permanent. See [ARCHITECTURE.md](ARCHITECTURE.md), the [tutorial](docs/TUTORIAL_BINDING_PRECEDENT.md), and [Phase 4 report](docs/v7/reports/PHASE_4.md) for implementation and verification details.
