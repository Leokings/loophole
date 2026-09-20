# Deployment runbook

Loophole deploys as one permanently linked `AutonomousRepublic` and `RepublicCourt` pair. The current public release targets gasless StudioNet: chain 61999 at `studio.genlayer.com`. The optional `bradbury` stage targets chain 4221 at `rpc-bradbury.genlayer.com`. A mismatched stage, host, chain ID, account address, schema, source hash, execution result, or cross-link aborts the release. StudioNet is temporary and may reset; roll forward with the same verified process when it does.

## 1. Verify the release candidate

From the repository root:

```powershell
python -m pip install -r requirements.txt
cd web
npm ci
cd ..
cd scheduler
npm ci
cd ..
python scripts/verify.py --integration
```

The integration scenario runs five validators through both contracts, including autonomous rounds, charter enactment, an election, a crisis, evidence capture, a consensus court ruling, and the asynchronous sanction callback.

## 2. Prepare a dedicated deployer

Copy `web/.env.deploy.example` to `web/.env.local` and replace the two account placeholders. The script derives the address from the private key and refuses to continue if `GENLAYER_DEPLOYER_ADDRESS` does not match.

Use a separate deployment account. Do not reuse a personal wallet and do not upload `GENLAYER_DEPLOYER_PRIVATE_KEY` to Vercel. StudioNet deployment and keeper writes are gasless. Bradbury requires enough GEN for deployment, linking, and keeper writes.

For a disposable StudioNet rehearsal, you may omit both deployer variables and set `LOOPHOLE_EPHEMERAL_STUDIONET=1`. The script generates the account only in memory, never prints or persists its key, and completes the only owner operation (`set_court_address`) in the same run. This mode is refused on Bradbury.

To create separate StudioNet deployer and keeper identities plus a random cron secret without printing any secret, run `npm run release:init` from `web/`. It writes a gitignored `web/.env.local`, refuses to overwrite an existing file, and prints only the two public addresses. For Bradbury defaults, use `npm run release:init -- --bradbury`, fund both addresses, and use `npm run release:status` to check public GEN balances.

Timing variables are constructor state and cannot be changed later:

| Variable | Allowed | Default |
| --- | --- | --- |
| `LOOPHOLE_COMMIT_SECONDS` | 60–604800 | 86400 |
| `LOOPHOLE_REVEAL_SECONDS` | 60–604800 | 86400 |
| `LOOPHOLE_SEASON_ROUNDS` | 8–30 | 12 |
| `LOOPHOLE_BRIEF_SECONDS` | 60–604800 | 86400 |
| `LOOPHOLE_APPEAL_SECONDS` | 60–604800 | 86400 |

For a StudioNet smoke release, 60-second windows and an eight-round season make the whole lifecycle testable. For a public asynchronous world, choose windows based on the expected play cadence before deploying.

## 3. Deploy and link

```powershell
cd web
npm run deploy:studionet
```

StudioNet is the intended hosted target. To make an optional fee-bearing Bradbury release later:

```powershell
npm run deploy:bradbury
```

The command performs these steps without manual address copying:

1. Verify the selected RPC chain ID.
2. Ask the network to build schemas for both repository sources.
3. Deploy `AutonomousRepublic` and wait for finality and successful execution.
4. Deploy `RepublicCourt` with the republic address and wait for finality.
5. Call the owner-only, one-time `set_court_address` link.
6. Read deployed source and schema back from the network.
7. Verify `get_game.court_address` and `get_court.republic_address` in both directions.
8. Write a secret-free, timestamped JSON artifact under `deployments/` and print the frontend variables.

Do not continue if a transaction finalizes with an execution error. Finality alone is not proof that GenVM execution succeeded.

If the network accepted a deployment but the local process stopped before the pair was complete, set `LOOPHOLE_RESUME_REPUBLIC_ADDRESS` with `LOOPHOLE_RESUME_REPUBLIC_TX_HASH`, and optionally the matching `LOOPHOLE_RESUME_COURT_ADDRESS` with `LOOPHOLE_RESUME_COURT_TX_HASH`. The script revalidates the receipt, exact source, schema, constructor state, owner, and existing one-time link before continuing. Preserve the checksum casing printed in StudioNet receipts because its contract lookup is currently case-sensitive.

## 4. Verify an existing deployment

Anyone can rerun source, schema, state, and link verification without a key:

```powershell
cd web
npm run verify:deployment -- ../deployments/studionet-<timestamp>.json
```

## 5. Configure the web app and keeper

Use the artifact's `frontendEnvironment` and `keeperEnvironment` fields. The Vercel project root must be `web`. The checked-in helper validates the artifact and the dedicated keeper identity, then sends only the required variables to Preview and Production over Vercel CLI stdin:

```powershell
cd web
npm run hosting:configure -- ../deployments/studionet-<timestamp>.json
```

The helper never uploads `GENLAYER_DEPLOYER_PRIVATE_KEY` and never prints either secret.

Public build variables:

- `NEXT_PUBLIC_GENLAYER_NETWORK`
- `NEXT_PUBLIC_GENLAYER_RPC_URL`
- `NEXT_PUBLIC_REPUBLIC_ADDRESS`
- `NEXT_PUBLIC_COURT_ADDRESS`

Server-only variables:

- `CRON_SECRET`: a random value of at least 32 characters, shared only with the Cloudflare scheduler.
- `GENLAYER_KEEPER_PRIVATE_KEY`: a dedicated automation account key.
- `GENLAYER_KEEPER_ADDRESS`: the expected address derived from that key.
- `LOOPHOLE_REPUBLIC_ADDRESSES`: comma-separated republic addresses.
- `LOOPHOLE_COURT_ADDRESSES`: comma-separated court addresses.
- `LOOPHOLE_KEEPER_MAX_CONTRACTS`: processing cap, default 20 and hard-capped at 100.

Never expose the keeper key with a `NEXT_PUBLIC_` prefix. StudioNet needs no keeper funding. On a fee-bearing network, fund only the dedicated keeper address with the GEN required for routine permissionless calls.

## 6. Deploy Vercel only after addresses exist

From `web/`, run a preview deployment after environment synchronization. Verify the demo badge is gone, accepted state loads, and `/api/cron/advance` returns 401 without the bearer secret before promoting the same source to production.

```powershell
vercel deploy --yes --target=preview --skip-domain
vercel deploy --yes --prod --skip-domain
vercel promote <verified-production-deployment-url> --yes
```

The included `vercel.json` allows the keeper route up to 300 seconds but does not register a Vercel Cron. The project uses Cloudflare Cron Triggers because Vercel Hobby cannot run a five-minute schedule. The route remains private and returns 401 when called without the bearer secret.

## 7. Deploy the Cloudflare scheduler

The checked-in `KEEPER_URL` targets `https://loophole-zeta.vercel.app/api/cron/advance`. If the production alias changes, update that value first. Then set the same `CRON_SECRET` as a Cloudflare Worker secret and deploy:

```powershell
cd scheduler
npm run activate
```

`activate` reruns types, tests, and a dry deployment, then pipes `CRON_SECRET` from the gitignored local release file to Wrangler without printing it and deploys the Worker. The Worker has no public `workers.dev` route and stores no GenLayer key. Its only cron runs every five minutes in UTC and makes one authenticated HTTPS request to Vercel. Allow up to 15 minutes for trigger changes to propagate.

## 8. Release smoke test

On a short-window StudioNet deployment:

1. Confirm `get_game.phase` begins at `COMMIT` and `court_configured` is true.
2. Claim one faction, commit an action using `preview_action_commitment`, and reveal it after the commit deadline.
3. Leave all other seats empty and call the keeper endpoint after the reveal deadline.
4. Confirm the human action source is `HUMAN`, empty seats are `AI_EMPTY_SEAT`, and the round advanced.
5. Let one claimed controller miss a later reveal and confirm its source becomes `AI_TIMEOUT`.
6. Exercise a law vote, case filing, court resolution, and finalized callback before treating the public release as ready.

## Roll forward, not in place

Contract configuration and the court link are intentionally immutable. If a release has the wrong timing or source, deploy a new pair, verify it, update the web and keeper address lists, and retain the old artifact for historical reads. Never edit an artifact to make it appear to describe a different deployment.
