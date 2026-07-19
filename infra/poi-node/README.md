# Self-hosted Railgun POI node

The TEE's privacy leg (shield/unshield via Railgun) needs a reachable **Private
Proof-of-Innocence (PPOI) aggregator node**. The public ones are down, so run
your own. This is [`@railgun-community/proof-of-innocence`](https://github.com/Railgun-Community/private-proof-of-innocence)
(a Node.js + MongoDB service) packaged as Docker.

Same compose runs locally and on a VPS.

## Requirements
- Docker + Docker Compose.
- ~2–4 GB RAM and some disk for MongoDB.
- Outbound RPC access (the node uses built-in public RPCs per network; override
  later for reliability).

## Run it

```bash
cd infra/poi-node
cp .env.example .env

# 1) Set a strong Mongo password in .env (MONGO_PASSWORD), e.g.:
#    openssl rand -hex 24

# 2) Generate the ed25519 key pair, paste pkey/pubkey into .env
docker compose run --rm --no-deps poi-node node src/config/keyGenerator.js

# 3) Start mongo + the node
docker compose --env-file .env up -d --build

# 4) Watch it boot / sync
docker compose logs -f poi-node
```

The API is published on **127.0.0.1 only** by default and Mongo is never exposed,
so nothing is reachable from the internet until you deliberately open it (below).

## Verify

```bash
curl -s http://localhost:8080/                 # liveness
curl -s http://localhost:8080/node-status-v2   # per-network sync status
```

`/node-status-v2` reports the sync state per network. The node needs to sync the
shield/event data (and, ideally, peer proof data) before it can serve valid
proofs — this is the slow part, not the boot.

## Point the TEE at it

In `packages/tee/.env`:

```
RAILGUN_POI_NODE_URL=http://localhost:8080
RAILGUN_MNEMONIC=...
RAILGUN_ENCRYPTION_KEY=...
RAILGUN_RPC_42161=https://<your-arbitrum-rpc>
```

On boot the TEE probes this URL and logs whether the POI node is reachable; if it
isn't, the privacy leg stays disabled and routes pause at the shield step.

## Hosting on a VPS
Same steps on the server. Then:
- Keep `POI_BIND=127.0.0.1` and put a **TLS reverse proxy** (Caddy/nginx) in
  front, pointing at `127.0.0.1:8080`; set `RAILGUN_POI_NODE_URL=https://poi.yourdomain.com`.
  Only set `POI_BIND=0.0.0.0` if you intend to expose the raw HTTP port directly
  (not recommended — no TLS).
- Use a strong, unique `MONGO_PASSWORD`. Mongo stays on the internal compose
  network and is never published.
- `docker compose up -d` already restarts on failure/boot.
- Override the built-in RPCs with your own (Alchemy/Infura) for reliable syncing.

## Honest caveats
- **Booting is easy; producing proofs the ecosystem accepts is the hard part.** A
  standalone list provider proves against *its own* list. For your unshields to
  be recognized on mainnet, your node must sync from / peer with the recognized
  list providers (`NODE_CONFIGS`) — and those public peers are currently down.
  For local development and testing the shield/unshield mechanics against your own
  pool, a standalone node is enough.
- Targets Node 16.20+/18; it runs in its own container so it never clashes with
  the TEE's Node version.
- `POI_REF` defaults to `main`; pin it to a commit sha for reproducible builds.
