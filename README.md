# Loophole

Loophole is a population-independent political strategy game built natively on GenLayer. A republic keeps moving even when nobody is online: human players may claim faction seats and use private commit/reveal turns, while the Intelligent Contract supplies consensus-validated actions for every empty or timed-out seat.

The live game is available at [loophole-zeta.vercel.app](https://loophole-zeta.vercel.app). It reads the gasless StudioNet republic at `0x6ECdc692BE72c75a3CD15197c32D61dbd61660D8` and court at `0x315fD6524eB1eb85c907F45FA4d24A896FCF40b2`; a Cloudflare trigger wakes the Vercel keeper every five minutes. StudioNet is temporary and may reset, so the deployment artifact and release scripts are designed to roll forward to a replacement pair.

### Reviewer wallet-flow verification — September 22, 2026

The live frontend now offers two explicit signed paths: an injected EIP-1193
wallet in desktop Chrome or Edge, and a one-click temporary StudioNet wallet
whose key remains in that browser tab. Every write waits for GenLayer
`FINALIZED`, rejects a consensus disagreement or execution failure, then forces
an uncached accepted-state read. Current-round reveals are read back from the
contract and rendered as accepted on-chain actions even after a reload. The
temporary wallet also restores after a page reload, so a player can return for
the reveal phase without losing the commit secret.

Wallet `0x4eb7210ad49e0f56fe25782b9c77151754c4c624` completed the requested live
path against the deployed republic. Contract readback for round 135 records
`BUILD_INFLUENCE`, actor `0x4eb7…c624`, and source `HUMAN`. The test seat was
released afterward and is autonomous again.

- [Claim Civic Reformers](https://explorer-studio.genlayer.com/tx/0x92fbd22527df704a41a04facfc8a7c2a6f27aca2f3f377c11f637df01406b465)
- [Finalize the round-135 action commitment](https://explorer-studio.genlayer.com/tx/0x56c762e428315821fdd234817a90194254d32e80fb93249491aacae358f1e1ba)
- [Reveal the round-135 human action](https://explorer-studio.genlayer.com/tx/0x5b3d51bd5b7a45fedf212deda70c0073e755462899ee5b5edff1f6475dfd4b21)
- [Release Civic Reformers back to consensus AI](https://explorer-studio.genlayer.com/tx/0x8990f24e8a3f89a93f3e7762bcfa19b4a54c4b6008593d0b882580bf432cf357)

### Finalized two-wallet production proof

The current pair was deployed from the repository source, linked in both
directions, and source/schema verified. Two test wallets then claimed distinct
factions, sealed and revealed independent actions in round 2, and finalized a
mixed human/consensus round. Accepted state records `GROW_WEALTH` and
`BUILD_INFLUENCE` with source `HUMAN`; the other two factions have source
`AI_EMPTY_SEAT`. Both test seats were released after settlement, leaving all
four factions autonomous for visitors.

- [Deploy AutonomousRepublic](https://explorer-studio.genlayer.com/tx/0x8daad3da998bcc590afa028ba20440d3cad6541a5937a680e67179c36ffb1e68)
- [Deploy RepublicCourt](https://explorer-studio.genlayer.com/tx/0x7dc547f1d872105f27e4c96cc56cdda03ab812d2bb6adeb727b08edb219bc13e)
- [Link the court](https://explorer-studio.genlayer.com/tx/0xf9284de0421717d82f021dc4cc070e82a620a4729170c6634bf541cda907188a)
- [Merchant wallet claims a faction](https://explorer-studio.genlayer.com/tx/0x759b730be3c28981b33c966b079ac27f4403b449c1aeb71b7dcbf25a8f214dc2)
- [Reformer wallet claims a second faction](https://explorer-studio.genlayer.com/tx/0x98cc48d76bba6b38dd5c0218994aa3380a36ef4810eca55d0af51b80838f2208)
- [Merchant seals an action](https://explorer-studio.genlayer.com/tx/0x05b116b3d50453f4101753b32d5472119a5498d704b1fd36dd45b2ed993c2c95)
- [Reformer seals an action](https://explorer-studio.genlayer.com/tx/0xd0587e899a3babd777dea8687a2ced2e51fb0f8c0f569d18b6f4dedc71ad226e)
- [Merchant reveals its action](https://explorer-studio.genlayer.com/tx/0x10ca9b08f33973944232ba87a494583d734c28c443241a24efdf4fd6d4e50dd2)
- [Reformer reveals its action](https://explorer-studio.genlayer.com/tx/0x8855c91dee5ba9423491904d61fc49de170789d959d81255328b9722650a7bff)
- [Settle round 2 through consensus](https://explorer-studio.genlayer.com/tx/0xc0ec2bcad03cf5c5e291f71927ef26ae525aefc0c1e4bc939d3682d6a4fe8ce6)
- [Release the Merchant seat](https://explorer-studio.genlayer.com/tx/0x1e49b3bb0939a48e690dbadd3830e43722b9cd186ddb1eb1d27ccd7f56d54215)
- [Release the Reformer seat](https://explorer-studio.genlayer.com/tx/0x362111444e141b0539dd88204d36584a0a672a934d8929bc98ee4b2372e304d8)

The resumable proof runner is
`tests/integration/test_loophole_studionet_evidence.py`; generated wallet keys
and commit nonces remain outside version control.

This is the complete game foundation, not a throwaway MVP. It includes the autonomous republic, constitutional politics, offices and elections, AI-generated crises, seasonal scoring, a separate AI court with appeals and precedent, a browser game, and a permissionless keeper.

## What is live in the codebase

- Three to eight persistent factions with human claim/release and AI continuity.
- Commit/reveal human turns that do not expose an action before everyone is bound.
- Thirteen bounded actions covering resources, rivalry, legislation, charters, amendments, repeal, elections, vetoes, and crisis response.
- Statutes and charters with voting thresholds, historical effective ranges, veto windows, supersession, and repeal.
- Executive, Speaker, and Treasurer offices with recurring elections and deterministic powers.
- Consensus-generated crises, independently audited response scores, and deterministic rewards or penalties.
- Eight-to-thirty-round seasons, public event scoring, secret objective commit/reveal, winners, and persistent lifetime points.
- A separate `RepublicCourt` that freezes evidence from republic state, accepts party briefs, reaches consensus rulings, handles appeals, creates precedent, and calls sanctions back to the republic.
- A responsive Next.js game client with a polished demo world when no contract address is configured.
- A protected Vercel keeper endpoint plus a five-minute Cloudflare scheduler that advances ready republic phases and court deadlines without making any game decision.
- Direct tests plus a five-validator, two-contract GLSim integration scenario.

## Why an empty world still works

```text
human reveals, if any
          +
missing or timed-out faction seats
          |
          v
GenLayer leader proposes a closed action batch
          |
          v
independent validators audit strategy + legality
          |
          v
contract validates again and applies fixed effects
          |
          v
round, laws, elections, crises, and season advance
```

The AI players are GenLayer Intelligent Contract nondeterministic execution. They are not a centralized bot in the web app and not the keeper. Validators must agree on the bounded output, and deterministic contract code is the only code allowed to change resources or world state.

## Repository map

| Path | Responsibility |
| --- | --- |
| `contracts/AutonomousRepublic.py` | Authoritative game loop, laws, offices, crises, objectives, and seasons. |
| `contracts/RepublicCourt.py` | Evidence, briefs, rulings, appeals, sanctions, and precedent. |
| `web/` | Browser game and protected keeper endpoint. |
| `scheduler/` | Cloudflare Cron Trigger that wakes the keeper without holding a GenLayer key. |
| `tests/direct/` | Fast state-machine and safety tests. |
| `tests/integration/` | Five-validator GLSim cross-contract scenario. |
| `web/scripts/` | Fail-closed StudioNet/Bradbury deployment and verification. |
| `docs/` | Deployment and operations runbooks. |

## Run the browser game

The web app intentionally starts in demo mode, so it can be evaluated without a wallet or a deployed contract.

```powershell
cd web
npm install
npm run dev
```

Open `http://localhost:3000`. Add the four `NEXT_PUBLIC_*` values from a deployment artifact to `web/.env.local` to switch from demo data to accepted GenLayer state.

## Verify everything locally

```powershell
python -m pip install -r requirements.txt
cd web
npm install
cd ..
python scripts/verify.py --integration
```

That command runs GenVM lint and type checking for both contracts, 34 direct tests, the five-validator GLSim integration test, frontend lint/type/tests and a production Next.js build, plus scheduler type/tests and a dry-run Worker bundle.

## Deploy

Deployments are deliberately two-step: deploy and cryptographically record the two linked contracts, then configure the web app and its keeper from that artifact.

```powershell
Copy-Item web/.env.deploy.example web/.env.local
# Fill the dedicated deployer key and desired timing values.
cd web
npm run deploy:studionet
```

StudioNet is gasless, so neither the deployer nor keeper needs GEN. Use `npm run deploy:bradbury` only when intentionally moving to that fee-bearing testnet with funded accounts. Both commands verify the RPC chain ID, preflight schemas, require successful GenVM execution, link the court once, read source back, verify methods and cross-links, and write a secret-free record under `deployments/`.

Full instructions are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Keeper behavior and incident handling are in [`docs/OPERATIONS.md`](docs/OPERATIONS.md). The trust boundary is documented in [`ARCHITECTURE.md`](ARCHITECTURE.md).
