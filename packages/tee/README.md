# @erebuz/tee

TEE service for **stealth addresses**, **ENS / CCIP off-chain resolution**, **NEAR-intent swaps**, and a **private cross-chain router** (`/private-route`) that bridges via [Relay](https://relay.link) and breaks the on-chain link through the [Railgun](https://railgun.org) shielded pool.

Smart accounts are **Biconomy Nexus (ERC-7579)**. The runtime is **Node** (not Bun).

---

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | **Node ≥ 20** via [`tsx`](https://github.com/privatenumber/tsx) (runs TypeScript directly) |
| HTTP server | [`@hono/node-server`](https://github.com/honojs/node-server) running an itty-router `fetch(request) → Response` handler |
| Router | [`itty-router`](https://github.com/kwhitley/itty-router) v4 |
| Database | **SQLite** via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (file at `DATABASE_PATH`, default `./data/tee.db`) |
| EVM (core) | [`viem`](https://viem.sh) |
| Stealth keys | [`@fluidkey/stealth-account-kit`](https://github.com/fluidkey/stealth-account-kit) |
| Privacy (Railgun) | [`@railgun-community/wallet`](https://github.com/Railgun-Community/wallet) + `ethers` v6 (in-process, lazy) |
| Bridging | Relay deposit-address API (`https://api.relay.link`) |

---

## Prerequisites

- **Node ≥ 20**
- **pnpm** (this package is a member of the `erebuz-monorepo` pnpm workspace)
- A **`PRIVATE_KEY`** — the TEE signer EOA. It is used everywhere: signing the Nexus `InstallConfig` / `ExecuteTransfer` (EIP-712), sending on-chain txs, signing CCIP responses, and (for `/private-route`) shielding/unshielding.

There is **no** database server to install — SQLite is a local file, and the schema auto-initializes on boot.

---

## Install & run

From the monorepo root:

```bash
pnpm install
pnpm --filter @erebuz/tee dev      # tsx watch index.ts  (hot reload)
# or
pnpm --filter @erebuz/tee start    # tsx index.ts
# or the root convenience script:
pnpm tee                           # = pnpm --filter @erebuz/tee dev
```

The server listens on `PORT` (default `3000`).

### Environment

Copy and fill `.env.example`:

```bash
cp .env.example .env
```

Minimum to boot: `PRIVATE_KEY`. Everything else has sane defaults or degrades gracefully (see below). Full config is documented in `.env.example` — key groups:

- **Core:** `PRIVATE_KEY`, `DATABASE_PATH`, `PORT`, `NODE_ENV`
- **Nexus module (per chain):** `NEAR_INTENT_BRIDGE_BASE|POLYGON|ARBITRUM|OPTIMISM` — the transfer module address, trusted to the `teeSigner`. Until set, smart-account derivation falls back to the owner EOA and funds can't be moved out of a smart account.
- **Deposit monitor:** `DEPOSIT_MONITOR_ENABLED`, `DEPOSIT_MONITOR_INTERVAL_MS`
- **/private-route:** `RELAY_API_URL`, `PRIVACY_HUB_CHAIN_ID` (default `42161`/Arbitrum), `PRIVATE_ROUTE_MONITOR_ENABLED`, `PRIVATE_ROUTE_MONITOR_INTERVAL_MS`
- **Railgun (privacy leg):** `RAILGUN_POI_NODE_URL`, `RAILGUN_MNEMONIC`, `RAILGUN_ENCRYPTION_KEY`, `RAILGUN_RPC_<chainId>`, `RAILGUN_DB_PATH`, `RAILGUN_ARTIFACT_PATH`

### Scripts

| Script | What it does |
|---|---|
| `start` | `tsx index.ts` |
| `dev` | `tsx watch index.ts` |
| `db:init` | Reset + reinitialize the SQLite DB (`reset-db.ts --confirm`) |
| `db:reset` | Interactive DB reset |
| `register` | CLI helper to register a user against a running TEE (`register-user.ts`) |
| `test:ens` | ENS resolution smoke test |
| `lint` / `lint:fix` | ESLint |

---

## HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health — returns `Hello World` |
| `POST` | `/api/user/register` (alias `POST /set`) | Register a user (stealth keys + zcash addr). **EIP-712 signature verified** against `eoaAddress`. |
| `GET` | `/api/user/get/:name` (alias `GET /get/:name`) | Resolve an ENS username → owner + per-chain smart-account addresses |
| `POST` | `/api/scan` | Trigger a deposit-monitor scan |
| `GET` | `/lookup/:sender/:data.json`, `/:sender/:data.json` | ENS **CCIP off-chain resolver** gateway (signed with `PRIVATE_KEY`) |
| `POST` | `/api/private-route` | Create a private cross-chain route → returns the leg-1 deposit address |
| `GET` | `/api/private-route/:routeId` | Route status |

---

## Smart-account address computation (Nexus ERC-7579)

Addresses are **counterfactual** and read from the **Nexus Account Factory** — this is the authoritative "compute address" path (`src/utils/smart-account.ts`, and `src/utils/hub-account.ts` for TEE-owned hub accounts):

```
salt         = keccak256(owner or per-route seed)
initData     = abi.encode(nexusBootstrap, initNexusData)
initNexusData= NexusBootstrap.initNexusWithDefaultValidatorAndOtherModulesNoRegistry(
                 defaultValidatorInitData = owner,
                 validators = [],
                 executors  = [{ module: <transfer module>, data: signed InstallConfig }],
                 hook, fallbacks, preValidationHooks
               )
address      = NexusAccountFactory.computeAccountAddress(initData, salt)   // on-chain view call
```

- **Compute** → `nexusAccountFactory.computeAccountAddress(initData, salt)`
- **Deploy** → `biconomyMetaFactory.deployWithFactory(nexusAccountFactory, createAccount(initData, salt))` (`src/managers/chain/deployment.ts`)

The factory / implementation / bootstrap / validator addresses are the deterministic Biconomy Nexus deployments, configured per chain in `src/config/web3/chains/*.json` under `contracts[]`. The `executors[].data` embeds an EIP-712 `InstallConfig` signed by the `teeSigner`, so **the account address depends on the signer** — a given `(owner, salt, module, signer)` is fully deterministic.

---

## `/private-route` — private cross-chain transfer

Moves a token from a source chain to a destination chain **privately**: bridge in to a TEE-owned Nexus hub account on the privacy hub (Arbitrum), shield → unshield through Railgun (this severs the on-chain link), then bridge out to the recipient.

### Funds path

```
Base ──Relay deposit addr (recipient = hub SA)──▶ Nexus hub SA (Arbitrum, TEE-owned)
hub SA ──module.execute(TEE EIP-712 sig)──▶ TEE EOA (Arbitrum)
TEE EOA ──Railgun shield──▶ TEE Railgun wallet (shielded)
Railgun wallet ──Railgun unshield──▶ Relay leg-2 deposit addr (Arbitrum)
Relay leg-2 (recipient = user's dest addr) ──bridge──▶ user on Polygon
```

Privacy break: between the public side (hub SA / TEE EOA) and the unshield-to-a-fresh-Relay-address, the shielded pool cuts the link.

### Request

```bash
curl -X POST http://localhost:3000/api/private-route \
  -H 'Content-Type: application/json' \
  -d '{
    "sourceChainId": 8453,
    "destChainId": 137,
    "amount": "5",
    "userDestinationAddress": "0xRecipientOnPolygon",
    "tokenSymbol": "USDC"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "routeId": "route_…",
    "status": "AWAITING_DEPOSIT",
    "depositAddress": "0x…",         // send `amount` USDC here on the source chain
    "hubAccount": "0x…",             // Arbitrum hub account the leg-1 funds land in
    "hubIsSmartAccount": false,       // true once the transfer module is deployed
    "requestId": "0x…",
    "amount": "5000000"               // smallest units (USDC = 6 dp)
  }
}
```

The user sends `amount` to `depositAddress`. A background monitor then drives the route; poll `GET /api/private-route/:routeId`.

### State machine

`AWAITING_DEPOSIT → BRIDGING_IN → RECEIVED_ON_HUB → EXTRACTED → SHIELDED → UNSHIELD_SENT → BRIDGING_OUT → COMPLETED` (or `FAILED`).

The machine **pauses safely** where prerequisites are missing: it stays at `RECEIVED_ON_HUB` if the transfer module isn't deployed, and at `EXTRACTED` if Railgun isn't configured/ready — it never crashes.

### Relay integration (real API)

`src/services/relay/index.ts` uses the live Relay deposit-address API:

- Quote: `POST {RELAY_API_URL}/quote/v2` with `useDepositAddress: true`, `{ user, recipient, originChainId, destinationChainId, originCurrency, destinationCurrency, amount, tradeType, refundTo }`. The deposit address + request id come back on `steps[0].{depositAddress,requestId}`.
- Status: `GET {RELAY_API_URL}/intents/status?requestId=…`; `status === "success"` means filled.

### Railgun integration (in-process, degradable)

`src/services/railgun/index.ts`. Init sequence (validated): `startRailgunEngine(walletSource, levelDB, debug, artifactStore, useNativeArtifacts=false, skipMerkletreeScans=false, poiNodeURLs, …)` → `loadProvider(fallbackConfig, network, pollInterval)` (config `totalWeight` must be ≥ 2) → `createRailgunWallet(encryptionKey, mnemonic)`. Then `shieldERC20` (approve → `populateShield` → send) and `unshieldERC20` (`gasEstimate` → `generateUnshieldProof` (~20–30s) → `populateProvedUnshield` → send).

**Degradable:** if `RAILGUN_POI_NODE_URL` + `RAILGUN_MNEMONIC` + `RAILGUN_ENCRYPTION_KEY` aren't all set (or the POI node is unreachable), the engine does **not** start, the TEE still boots, and routes pause at the shield step.

### Prerequisites for a full end-to-end run

The route creation + leg-1 deposit address work out of the box. Completing a real transfer additionally needs:

1. **A reachable Railgun POI (Proof-of-Innocence) aggregator node** (`RAILGUN_POI_NODE_URL`). Public community nodes are frequently down — you may need to run your own.
2. **The transfer module deployed** on the hub chain with your `teeSigner`, and its address set (`NEAR_INTENT_BRIDGE_ARBITRUM`). Without it the hub account is just the TEE EOA and funds can't be extracted from a smart account.
3. A **funded `PRIVATE_KEY`** on the hub chain (gas for SA deploy, `module.execute`, shield, unshield, leg-2 send) and **real RPC** endpoints (`RAILGUN_RPC_42161`, and populate the chain-config `url`s).

---

## Project structure

```
packages/tee/
├── index.ts                         # Node server bootstrap (hono) + boot wiring
├── src/
│   ├── api/routes/                  # itty-router handlers (user, ccip, private-route)
│   ├── services/
│   │   ├── user/                    # registration (EIP-712 verified), ENS resolution
│   │   ├── near-intents/            # NEAR 1Click bridge client
│   │   ├── deposit-monitor/         # balance-polling monitor + module execute
│   │   ├── eip712-signer/           # InstallConfig / ExecuteTransfer signing
│   │   ├── relay/                   # Relay deposit-address client
│   │   ├── railgun/                 # Railgun engine + shield/unshield (lazy, degradable)
│   │   └── private-route/           # /private-route orchestrator + state machine + poller
│   ├── managers/
│   │   ├── db/                      # better-sqlite3 DbManager (schema in initSchema)
│   │   ├── chain/                   # Chain manager (viem clients), Nexus deploy
│   │   └── log/                     # Logger
│   ├── database/models/             # ens-username, stealth-user, stealth-address, private-route
│   ├── config/
│   │   ├── global-config.ts         # constants + env-derived config
│   │   └── web3/chains/*.json       # per-chain tokens, Nexus contracts, module addrs
│   └── utils/
│       ├── smart-account.ts         # computeSmartAccountForENS (Nexus factory)
│       ├── hub-account.ts           # computeTeeOwnedHubAccount (TEE-owned, per-route)
│       └── hub-transfer.ts          # move funds out of a Nexus account via the module
└── .env.example
```

## Notes

- Requires the Node runtime (uses `better-sqlite3` and `@hono/node-server`; no `bun:` APIs).
- `packages/nexus` (in the monorepo) holds the Nexus contract source + modules if you need to build/deploy your own module.

## License

ISC
