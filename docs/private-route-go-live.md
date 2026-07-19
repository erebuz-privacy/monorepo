# Private Route — go-live checklist

What "live" means: a user gets a quote, sends a deposit, and the recipient
receives on another chain with the on-chain link broken (Relay → Railgun on
Arbitrum → Relay).

Legend: `[x]` done · `[ ]` to do · **(ops)** you provide/run · **(code)** I can do.

---

## 0. Already done `[x]`
- [x] Quote / create / status API + Relay discovery (all 66 bridgeable chains, cross-token, fee-on-output, live quotes)
- [x] App UI (quote → method → transfer), RainbowKit connect
- [x] Railgun integration (network mapping fixed, degradable)
- [x] POI node scaffold (`infra/poi-node`, hardened) + TEE reachability probe
- [x] Health-check script (`pnpm --filter @erebuz/tee verify:route`)
- [x] Key generator (`pnpm --filter @erebuz/tee gen:railgun-keys`)

---

## 1. Run the TEE  **(ops)**
- [ ] Host the TEE (Node) on a persistent box → e.g. `tee.wall8.xyz`. Runs via `pnpm --filter @erebuz/tee start`.
- [ ] `PRIVATE_KEY` — the TEE signer EOA (replace the dummy). **Fund it with ETH on Arbitrum** (gas for shield + unshield).
- [ ] `RELAY_API_URL=https://api.relay.link` (default; optional `RELAY_API_KEY` for higher limits).
- [ ] Arbitrum RPC: set `RAILGUN_RPC_42161=<alchemy/infura url>` and fill the empty `url` in `src/config/web3/chains/arbitrum.json`.

## 2. Privacy leg — Railgun + POI  **(ops, hardest)**
- [ ] Generate the Railgun wallet: `pnpm --filter @erebuz/tee gen:railgun-keys` → set `RAILGUN_MNEMONIC` + `RAILGUN_ENCRYPTION_KEY` (store in Doppler).
- [ ] Stand up the POI node: `cd infra/poi-node && cp .env.example .env` → set `MONGO_PASSWORD` + keygen `pkey`/`pubkey` → `docker compose --env-file .env up -d --build`.
- [ ] Let it sync (watch `curl localhost:8080/node-status-v2`); front with TLS on a VPS.
- [ ] Point the TEE at it: `RAILGUN_POI_NODE_URL=http://localhost:8080` (or your https URL). TEE probes it on boot.
- [ ] Peering/list: a standalone node proves against its own list; for mainnet acceptance it must peer with recognized list providers (`NODE_CONFIGS`) — currently the public peers are down. Ask the Railgun builders Discord for a live peer.

## 3. Validate the on-chain path  **(code — highest-value next step)**
- [ ] Fork/testnet harness (Anvil/Tenderly Arbitrum fork) exercising shield → unshield → AA UserOp with fake funds, before any real money. This is the one unproven path.

## 4. App / users  **(ops + 1 decision)**
- [ ] Deploy the app (Vercel) with `NEXT_PUBLIC_TEE_URL` → hosted TEE.
- [ ] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — real id from cloud.reown.com (currently placeholder).
- [ ] Decide the "managed" model: keep it address-based (works today) or build real accounts (Privy). Login is currently mocked.

## 5. Operations / money  **(ops)**
- [ ] Fee/margin sweep — the fee is surplus left in the Railgun pool; add a withdraw process.
- [ ] Hot-key management — move `PRIVATE_KEY` to a KMS/enclave (it controls gas + hub accounts).
- [ ] Monitoring/alerting on stuck/`FAILED` routes + confirm Relay refunds land.

---

## Verification ladder
1. **API** — `pnpm --filter @erebuz/tee verify:route` (chains → tokens → quote → create → poll). No funds. ✅ passes today.
2. **App** — quote → method → transfer shows a real deposit address + polling.
3. **Bridge-in (no privacy leg)** — send a small real deposit → status reaches `RECEIVED_ON_HUB` (funds land in the hub account on Arbiscan).
4. **Privacy leg** — with POI node + funded key: route advances `SHIELDED → UNSHIELD_SENT → BRIDGING_OUT → COMPLETED`; check shieldTx/unshieldTx + recipient.
5. **Full E2E** — one small transfer across chains, confirmed `COMPLETED`.

## Critical path
**§1 + §2 + §3** = one working end-to-end private transfer. The two genuine
unknowns are the **POI node** (flaky ecosystem/peering) and the **on-chain
shield/unshield validation** (never run). Everything else is standard deploy.
