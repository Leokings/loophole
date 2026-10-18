# Abandoned V7 release attempts

These are historical attempts, not the successful V7 release or its proof.

| Attempt | Republic | CaseLaw | Court | Why it ended |
| --- | --- | --- | --- | --- |
| 1, 2026-10-18 | `0x0d763952e28ad6ea67535fE1646c1DB46f65008F` | `0xF2b831B05dB4ea3c495463CdF0E6e604D0349117` | `0x5133989b6c628189739AA184B399D99f9525189D` | The handoff records a stale 300-second commit setting and a StudioNet 503. The first commit window was missed. |
| 2, 2026-10-18 | `0x25D1B1aD6bf0650dDBe5ed97e47136D387FB57B9` | `0xcEE1A3c08Af32B28387619Ef9FFc86f8184A8D80` | `0x359dAdfa71061a637d1d7A232FdF4a5fDC5A0234` | Windows refused a checkpoint rename after r3. The unattended r4 commit window subsequently passed. |

[Attempt 2's deployment record](studionet-2026-10-18T04-48-26.345Z.json)
belongs to source commit `a59c069397ae5ddf6513ba533c91fcb7d9619f88` and records
successful finalized deployments and links. Its separately archived demo state
records both law certifications as `FINALIZED_SUCCESS`, the early-fallback guard
as `FINALIZED_EXPECTED_FAILURE`, and an r3 read-back showing the Officeholder
Protection law enacted 3–0 and round 4 opened. Its r3 advance transaction was
still recorded as `ACCEPTED_PENDING_FINALITY`; that receipt was not independently
rechecked during the GitHub handoff implementation.

No complete binding-precedent demonstration or verified final proof manifest
was produced by either attempt. See
[`PHASE_5B.md`](../../docs/v7/reports/PHASE_5B.md) for the evidence boundaries.
