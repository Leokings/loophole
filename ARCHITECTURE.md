# Loophole architecture

## Product invariant

No game-critical path may require a second human, a live lobby, or an off-chain judge. A republic has fixed faction seats. Humans can temporarily control seats, but every empty seat and every missed reveal is resolved by consensus-validated AI inside `AutonomousRepublic`. The world therefore advances with zero, one, or many people online.

## Authority boundary

### `AutonomousRepublic` owns

- Factions, controllers, resources, legitimacy, stability, rounds, and deadlines.
- Human action and secret-objective commitments and reveals.
- The public snapshot supplied to AI faction reasoning.
- The closed action schema and all deterministic numeric effects.
- Statutes, charters, amendments, repeal, veto windows, and historical effectiveness.
- Offices, election scheduling and outcomes.
- Crisis creation, responses, scoring, and consequences.
- Season scoring, winners, summaries, and lifetime points.
- Exactly-once application of sanctions from its configured court.

### `RepublicCourt` owns

- Case identity and party authorization.
- Immutable evidence captured from resolved republic actions and laws effective at that round.
- Briefing and appeal deadlines.
- Consensus-validated verdicts and appeal decisions.
- Final rulings, precedent, and a one-way sanction callback to its linked republic.

### GenLayer nondeterministic execution owns

- Strategic action selection for missing faction turns.
- Crisis descriptions and resolution standards.
- Evaluation of bounded crisis responses.
- Legal interpretation for initial rulings and appeals.
- Independent validator audits of each proposed nondeterministic result.

It does not own balances or arbitrary state transitions. Every result is parsed against an exact schema and then passed to deterministic code.

### The browser and keeper own

- Wallet connection, polling, rendering, local unrevealed nonces, and transaction submission.
- Non-authoritative demo data when no live address is configured.
- Permissionless wake-up calls after an on-chain deadline.

The keeper has no policy input. It reads accepted phase/status fields and calls only `advance_round`, `finalize_season`, `start_next_season`, `resolve_case`, `finalize_case`, or `resolve_appeal` when the contract reports that the corresponding deadline has arrived.

## Round lifecycle

1. During `COMMIT`, a human controller stores only a digest of one exact structured action.
2. During `REVEAL`, the controller publishes that action plus its nonce; the contract recomputes the digest.
3. At `READY_TO_ADVANCE`, any account can call `advance_round()`.
4. The contract collects every missing faction ID. An AI leader proposes one legal action per missing ID from the same pre-settlement snapshot.
5. Independent validators check doctrine alignment, legality, resource constraints, action order, and anti-collusion rules.
6. The contract parses the agreed batch again, stores sources as `AI_EMPTY_SEAT` or `AI_TIMEOUT`, and applies all faction actions in stable seat order.
7. Law votes, elections, crisis resolution, and the next crisis opening settle; an append-only round summary is stored.
8. The next commit/reveal window opens, or the season enters objective reveal.

No unrevealed commitment is included in an AI prompt. AI replacement actions therefore cannot inspect a human's hidden move.

## Closed action surface

| Action | Contract-owned effect |
| --- | --- |
| `BUILD_INFLUENCE` | Add 2 influence. |
| `GROW_WEALTH` | Add 2 wealth. |
| `STABILIZE` | Spend 1 wealth and add 2 stability; the Treasurer waives the cost. |
| `UNDERMINE` | Spend 1 influence; remove 1 rival legitimacy and 1 stability. |
| `PROPOSE_LAW` | Spend 2 influence, or 1 as Speaker, and open a statute vote. |
| `SUPPORT_LAW` / `OPPOSE_LAW` | Cast one faction vote on a pending measure. |
| `PROPOSE_CHARTER` | Spend 4 influence and open a supermajority charter vote. |
| `AMEND_LAW` | Spend 3 influence and propose a replacement with linked history. |
| `REPEAL_LAW` | Spend 2 influence and propose the end of an enacted law. |
| `RUN_FOR_OFFICE` | Spend 1 influence and enter one open office election. |
| `VETO_LAW` | The Executive voids a newly enacted statute before it becomes effective. |
| `RESPOND_CRISIS` | Spend 1 wealth and submit a bounded response for consensus scoring. |

The LLM cannot invent action types, transfers, rewards, sanctions, or storage fields.

## Law and court integrity

Statutes receive a one-round delayed effective date so the Executive has a veto window. Charters and charter amendments require a two-thirds threshold. Amendments supersede an earlier law and repeal closes its effective range; the historical record remains readable.

When a controller files a case, the court reads the cited action, factions, and laws directly from the republic and freezes a canonical evidence digest. Later law amendments cannot rewrite what was effective when the disputed action occurred. A finalized sanction is sent asynchronously to `apply_court_ruling`; the republic recognizes only its configured court, stores each case digest once, and owns the fixed penalty table.

## Seasons and population independence

Seasons last 8–30 rounds. Elections recur every four rounds, and crises recur on the same cadence when room remains in the season. Public action outcomes create event points. Each faction also has a default objective or can commit and later reveal a secret one. Unrevealed secret objectives receive no objective score; they never block finalization. After the reveal deadline, the keeper can finalize standings and start the next season.

This design makes low population a game characteristic rather than an availability failure. Human participation changes who chooses faction strategy, not whether the simulation can operate.

## Consensus and input safety

- All LLM responses use exact key sets, bounded strings, canonical identifiers, and enumerated values.
- The leader must return exactly the requested faction IDs in stable order.
- Validators independently reason over the public state and proposed output rather than merely checking JSON shape.
- Player-controlled doctrine, law, claim, brief, and response text is quoted as data and length/control-character bounded.
- Deterministic validation runs before storage and again at settlement where relevant.
- Cross-contract callbacks authenticate the caller and are idempotent by case ID and ruling digest.
- Contract source pins the GenLayer runtime dependency on its first line.

## Off-chain topology

```text
browser wallet ---- signed player writes ----> GenLayer contracts
       |                                         ^
       +---- accepted-state reads ---------------+

Cloudflare Cron ---> protected Next.js route on Vercel ---> permissionless deadline writes
   shared secret                 |
                                 +-- server-only dedicated keeper key
```

Vercel hosts the client and the signing route. Cloudflare supplies only scheduling and the shared bearer secret; it never receives the GenLayer key. Neither service is authoritative. If either is unavailable, any account or replacement scheduler can issue the same ready-phase calls without migrating game state.

## Scaling path

Each republic/court pair is an independent world. Discovery, searchable history, notifications, and analytics can be indexed off-chain without becoming authoritative. Multiple republic addresses can share one keeper invocation up to a configured cap, and failures are isolated per contract. At larger scale, shard address lists across scheduled invocations rather than expanding a single unbounded call.
