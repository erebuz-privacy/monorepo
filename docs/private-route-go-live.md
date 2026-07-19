# Private Route — go-live checklist

The single source of truth for what's done and what's left to ship private
transfers. What "live" means: a user gets a quote, sends a deposit, and the
recipient receives on another chain with the on-chain link broken
(Relay → Railgun on Arbitrum → Relay).

Legend: `[x]` done · `[ ]` to do · **(ops)** you provide/run · **(code)** app work.

---

## Run the whole backend in one command

Everything the backend needs is one Docker stack (`infra/stack/`): the **TEE**,
the **Railgun POI node** (Arbitrum-enabled), and **Mongo**, wired together.

```bash
cd infra/stack
cp .env.example .env          # fill in: MONGO_PASSWORD, pkey/pubkey, PRIVATE_KEY, RAILGUN_*
docker compose --env-file .env up -d --build
```

The TEE talks to the POI node over the internal network (`http://poi-node:8080`);
you only expose the TEE, behind TLS. Details in `infra/stack/README.md`.

---

## 0. Done `[x]`
- [x] Quote / create / status API + Relay discovery (all 66 bridgeable chains, cross-token, fee-on-output, live quotes)
- [x] App UI (quote → method → transfer), RainbowKit connect
- [x] Railgun integration (network mapping fixed, hub = USDC on Arbitrum, degradable)
- [x] Health-check script (`pnpm --filter @erebuz/tee verify:route`) — passes live
- [x] Railgun key generator (`pnpm --filter @erebuz/tee gen:railgun-keys`)
- [x] **Self-hosted POI node that serves Arbitrum** (`infra/poi-node`) — builds, boots,
      syncs, `/node-status-v2` lists `Arbitrum (0:42161)` + Ethereum/BNB/Polygon.
      (Required an SDK bump to shared-models 7.4.3 + wallet 10.2.2; validated live.)
- [x] **TEE + POI + Mongo as one compose stack** (`infra/stack`)
- [x] TEE Docker image (`packages/tee/Dockerfile`)

---

## What's actually left

### 1. Provision secrets + a host  **(ops)**
- [ ] `PRIVATE_KEY` — the TEE signer EOA. **Fund it with ETH on Arbitrum** (gas for shield + unshield).
- [ ] `RAILGUN_MNEMONIC` + `RAILGUN_ENCRYPTION_KEY` — from `gen:railgun-keys` (store in Doppler).
- [ ] `pkey` / `pubkey` — POI list-provider pair (`keyGenerator.js`, see stack README).
- [ ] `MONGO_PASSWORD` — `openssl rand -hex 24`.
- [ ] Your own **Arbitrum + mainnet RPC** (Alchemy/Infura) → `ETH_MAINNET_RPC_URL` + Arbitrum RPC. The built-in public RPCs work but rate-limit the initial sync.
- [ ] A persistent box (VPS) for the stack, with a **TLS reverse proxy** in front of the TEE → `tee.wall8.xyz` (or similar).

### 2. Let the privacy leg become real  **(ops — the two genuine unknowns)**
- [ ] **POI sync**: after boot, let the node sync Arbitrum Railgun events (`curl localhost:8080/node-status-v2` until `Arbitrum` advances past `currentTxidIndex: -1`). Slow on public RPC — use your own.
- [ ] **List acceptance / peering**: a standalone node proves against *its own* list. For unshields the ecosystem recognizes, set `NODE_CONFIGS` to peer with recognized list providers — the public peers are currently down, so ask the Railgun builders Discord for a live peer. Until then, the privacy leg works against your own pool (fine for testing, not for mainnet acceptance).

### 3. Validate the on-chain path  **(code — highest-value, never run)**
- [ ] Fork/testnet harness (Anvil/Tenderly Arbitrum fork) exercising shield → unshield → AA UserOp with fake funds, before any real money. This is the one unproven code path.

### 4. App + users  **(ops + 1 decision)**
- [ ] Deploy the app (Vercel) with `NEXT_PUBLIC_TEE_URL` → the hosted TEE's https URL.
- [ ] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — real id from cloud.reown.com (currently placeholder).
- [ ] Decide the "managed" model: keep it address-based (works today) or build real accounts (Privy). Login is currently mocked.

### 5. Operations / money  **(ops)**
- [ ] Fee/margin sweep — the fee is surplus left in the Railgun pool; add a withdraw process.
- [ ] Hot-key management — move `PRIVATE_KEY` to a KMS/enclave (it controls gas + hub accounts).
- [ ] Monitoring/alerting on stuck/`FAILED` routes + confirm Relay refunds land.

---

## Verification ladder
1. **API** — `pnpm --filter @erebuz/tee verify:route` (chains → tokens → quote → create → poll). No funds. ✅ passes today.
2. **POI node** — `curl localhost:8080/node-status-v2` lists `Arbitrum`. ✅ works today (sync is the slow part).
3. **App** — quote → method → transfer shows a real deposit address + polling.
4. **Bridge-in (no privacy leg)** — small real deposit → status reaches `RECEIVED_ON_HUB` (funds land in the hub account on Arbiscan).
5. **Privacy leg** — with POI synced + funded key: route advances `SHIELDED → UNSHIELD_SENT → BRIDGING_OUT → COMPLETED`; check shieldTx/unshieldTx + recipient.
6. **Full E2E** — one small transfer across chains, confirmed `COMPLETED`.

## Critical path
**§1 + §2 + §3** = one working end-to-end private transfer. Infra to run the
node is now solved (the stack boots and serves Arbitrum); the two remaining
genuine unknowns are **POI list acceptance/peering** and the **on-chain
shield/unshield validation** (never run). Everything else is standard deploy.
