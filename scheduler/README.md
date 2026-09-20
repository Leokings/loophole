# Loophole keeper scheduler

This Cloudflare Worker wakes Loophole's protected Vercel keeper endpoint every five minutes. It never stores a GenLayer private key and it cannot submit an on-chain transaction directly.

## Local checks

```bash
npm ci
npm run check
```

`wrangler.jsonc` targets Loophole's stable production Vercel alias. If that alias changes, update `KEEPER_URL` before deployment. Set the shared secret without placing it in source control:

```bash
npm run activate
```

The activation command validates the bundle, pipes the secret from the gitignored `web/.env.local` to Wrangler without printing it, and deploys the schedule.

The Worker has no public `workers.dev` route. For local scheduled-event testing, use `npm run dev` and Wrangler's local `__scheduled` endpoint.
