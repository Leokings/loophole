# Keeper and operations runbook

## Chosen keeper service

The keeper runs inside the Next.js application as `GET /api/cron/advance`. A Cloudflare Cron Trigger calls it every five minutes. This preserves the trust boundary: Cloudflare stores only the shared bearer secret, Vercel alone stores the dedicated GenLayer keeper key, and neither component can choose faction actions, verdicts, scores, or numeric effects.

The endpoint requires an exact `Authorization: Bearer <CRON_SECRET>` header. The Worker supplies this header from a Cloudflare secret. Requests are dynamic, return `Cache-Control: no-store`, and never include the cron secret or keeper private key in their response. The scheduler has no public route and cannot be invoked over `workers.dev`.

## Work performed per invocation

For each configured republic, accepted `get_game` state maps to one permissionless write:

| Phase | Write |
| --- | --- |
| `READY_TO_ADVANCE` | `advance_round` |
| `READY_TO_FINALIZE_SEASON` | `finalize_season` |
| `SEASON_FINAL` | `start_next_season` |

For each configured court, the keeper scans only the bounded recent case range:

| Case state and elapsed deadline | Write |
| --- | --- |
| `BRIEFING` | `resolve_case(case_id)` |
| `APPEAL_WINDOW` | `finalize_case(case_id)` |
| `APPEALED` | `resolve_appeal(case_id)` |

One contract failure does not stop later contracts. A fully successful or no-op run returns 200; a partially failed run returns 207; invalid configuration returns 500; and an invalid bearer token returns 401.

## Health check

Call the production endpoint manually with the same bearer header after every environment or deployment change. A healthy response includes:

- `ok`: true when no contract failed.
- `keeperAddress`: the derived, verified sender address.
- `processed`, `submitted`, `skipped`, and `failed` counts.
- One result per configured republic plus submitted cases or a court-level skip.

Do not paste the bearer token into issue trackers or shared terminal transcripts.

## Expected no-op behavior

Most five-minute runs should be no-ops because commit, reveal, briefing, and appeal windows are longer. `skipped` is healthy. Alert on repeated `failed > 0`, authentication failures from the Cloudflare Worker, or a ready phase that remains unchanged across at least two scheduled invocations.

## Common incidents

### `401 Unauthorized`

Ensure the same `CRON_SECRET` exists in the active Vercel environment and Cloudflare Worker, and is at least 32 characters. Redeploy both sides after rotating it. Do not weaken or remove endpoint authentication.

### Network mismatch

`NEXT_PUBLIC_GENLAYER_NETWORK` accepts only `studionet` or `testnetBradbury`. The matching official RPC hostname is enforced. Correct both values together and redeploy.

### Keeper address mismatch

`GENLAYER_KEEPER_ADDRESS` is an operational assertion. If it does not match the private key, the route stops before a transaction. Correct the secret pair; do not remove the assertion during an incident.

### Fee-bearing network funds

StudioNet is gasless and requires no top-up. On a fee-bearing network, top up only the dedicated keeper address. Never substitute the deployment key or a personal wallet into the application.

### Transaction submitted but phase did not move

Inspect the transaction's execution result, not only its finalized status. Consensus finality can contain a GenVM execution error. Typical causes are a concurrent keeper winning the race, a phase changing between read and write, or validator/runtime failure. A concurrent loser is safe because methods validate current state.

### Court sanction not yet visible

Finalization sends an asynchronous contract message. Confirm the court case is `FINAL`, inspect the triggered transaction, then check `get_court_ruling(case_id)` and `court_ruling_count` on the republic. Repeating `finalize_case` is not the remedy once the case is final.

## Key rotation

The keeper is permissionless, so rotation does not require a contract transaction:

1. Generate a dedicated replacement key outside source control.
2. On a fee-bearing network only, fund its address with a minimal operating balance.
3. Update `GENLAYER_KEEPER_PRIVATE_KEY` and `GENLAYER_KEEPER_ADDRESS` together.
4. Redeploy and manually health-check the endpoint.
5. On a fee-bearing network, remove remaining funds from the old account using the wallet tool you used to provision it.

Changing the deployer key after release has no effect on the game. Only the original deployer address is stored as contract owner and can perform the one-time court link, which is completed by the deploy script.

## Capacity

The invocation validates the total configured address count against `LOOPHOLE_KEEPER_MAX_CONTRACTS`, default 20 and maximum 100. Court case scanning is also bounded. When latency approaches the function duration, split worlds between separate deployments or scheduled endpoints rather than raising the cap indefinitely.

### Cloudflare wake failed

Inspect Workers Logs for the structured `keeper_wake_failed` event. HTTP 4xx responses and invalid scheduler configuration are marked non-retryable; transient network and 5xx failures remain failed executions. Cloudflare Cron has at-least-once delivery, so rare duplicate wakeups are expected. Contract phase and case-state checks make a losing concurrent transaction safe.

Cron changes can take up to 15 minutes to propagate. Most healthy invocations log `keeper_wake_succeeded` with `submitted: 0` because no deadline is ready.

## Scheduler portability

Cloudflare Cron is the primary service, not a protocol dependency. Any reliable scheduler that can send HTTPS with a bearer header can replace it. Keep the same server route and secret, disable the old schedule before enabling the new one, and expect occasional harmless phase-race errors during handover.
