# Deployment records

Successful deployment commands write immutable, timestamped JSON records here. Records contain contract addresses, transaction hashes, constructor settings, network identity, source hashes, and the environment values needed by the web app and keeper. They never contain private keys or cron secrets.

Commit each public deployment record so a release can be independently verified with:

```powershell
cd web
npm run verify:deployment -- ../deployments/<record>.json
```

