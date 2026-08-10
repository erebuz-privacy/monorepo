# Erebuz private-route backend — single stack

Everything the private-route backend needs, in one `docker compose up`:

| Service    | What it is                                          | Exposed          |
| ---------- | --------------------------------------------------- | ---------------- |
| `tee`      | The private-route API the app calls                 | `127.0.0.1:3000` |
| `poi-node` | Railgun Proof-of-Innocence aggregator (Arbitrum + more) | `127.0.0.1:8080` |
| `mongo`    | Datastore for the POI node                           | internal only    |
| `asp`      | Erebuz Arc association-set proof API                 | `127.0.0.1:8787` |
| `asp-operator` | Testnet-only automatic Wall8 deposit approver    | internal only    |

The TEE reaches the POI node over the internal compose network
(`http://poi-node:8080`), so you only ever expose the TEE (behind TLS).

> Why not one image? The TEE is Node 20, the POI node is Node 18, and Mongo owns
> a volume — three different lifecycles. One image running all three is an
> anti-pattern; one compose stack is the correct "single unit". Each service
> still builds and restarts independently.

## Run it

```bash
cd infra/stack
cp .env.example .env

# 1) Mongo password
#    openssl rand -hex 24  -> MONGO_PASSWORD

# 2) POI list-provider key pair
docker compose run --rm --no-deps poi-node node src/config/keyGenerator.js
#    paste pkey / pubkey into .env

# 3) Railgun wallet (from repo root)
pnpm --filter @erebuz/tee gen:railgun-keys
#    paste RAILGUN_MNEMONIC / RAILGUN_ENCRYPTION_KEY into .env

# 4) PRIVATE_KEY = a funded Arbitrum signer EOA (gas for shield + unshield)

# 5) Bring it all up
docker compose --env-file .env up -d --build

# Watch it
docker compose logs -f
```

## Verify

```bash
curl -s http://localhost:8080/node-status-v2 | jq '.forNetwork | keys'   # Arbitrum listed
curl -s http://localhost:3000/api/relay/chains | jq '.data | length'     # TEE serving
```

Then run the end-to-end check from the repo root:

```bash
NEXT_PUBLIC_TEE_URL=http://localhost:3000 pnpm --filter @erebuz/tee verify:route
```

The Arc route expects `privacy-pool-arc` beside this repository (override
`ARC_ASP_BUILD_CONTEXT` when using another layout). `asp-operator` reads only
`POOL_DEPOSITED` Arc routes from the shared TEE SQLite volume, atomically updates
the persistent testnet policy, gateway-verifies the exact Filebase CID, and
publishes with the dedicated `ASP_POSTMAN_PRIVATE_KEY`. Railgun remains the
default provider; Arc is an additional quote choice.

## Hosting on a VPS
Same commands. Then:
- Keep `TEE_BIND` / `POI_BIND` at `127.0.0.1` and put a **TLS reverse proxy**
  (Caddy/nginx) in front of the TEE; set the app's `NEXT_PUBLIC_TEE_URL` to that
  https URL. You rarely need to expose the POI node at all.
- Strong, unique `MONGO_PASSWORD`. Mongo is never published.
- Set your own `ETH_MAINNET_RPC_URL` (and Arbitrum RPC) for reliable syncing.
- `restart: unless-stopped` on every service survives reboots.

See `../poi-node/README.md` for POI-specific detail (networks, SDK pin, the
peering caveat) and `../../docs/private-route-go-live.md` for the full go-live
checklist.
