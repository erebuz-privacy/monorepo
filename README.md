<p align="center">
  <img src="apps/landing/public/images/erebuz-logo.svg" alt="Erebuz" width="72" />
</p>

<h1 align="center">Erebuz</h1>

<p align="center">
  Private cross-chain USDC transfers with route choice built in.
</p>

Erebuz gives users a simple way to move USDC across chains without exposing a direct public link between sender and recipient. One transfer request returns a quote from every available privacy pool, and the user chooses which one handles the transfer.

Circle CCTP moves native USDC between chains. The privacy pools compete as interchangeable routes behind one quote.

![Erebuz private USDC routes](apps/deck/public/diagrams/private-usdc-routes.png)

## Three routes

| Route | Flow | Privacy |
| --- | --- | --- |
| <img src="apps/landing/public/protocols/railgun.jpg" alt="Railgun" width="28" /> Railgun | source → Circle CCTP → Railgun pool → Circle CCTP → destination | live |
| <img src="apps/landing/public/images/erebuz-logo.png" alt="Erebuz" width="28" /> Erebuz Pool | source → Circle CCTP → Erebuz Privacy Pool on Arc → Circle CCTP → destination | live |
| <img src="apps/app/public/chains/starknet.svg" alt="Starknet" width="28" /> STRK20 | source → Circle CCTP → Starknet → Circle CCTP → destination | transport only, see below |

The **Railgun** route shields USDC in the Railgun pool, waits for a Proof-of-Innocence attestation, unshields privately, and uses CCTP for the final hop.

The **Erebuz** route moves USDC to Arc through CCTP, deposits it into the Erebuz pool, waits for ASP approval, generates a Groth16 withdrawal proof, and pays the recipient.

The **STRK20** route hubs on Starknet. Both CCTP legs are implemented and validated on testnet; the privacy hop into StarkWare's pool is not yet wired — see below.

## How it works

1. The sender enters an amount and recipient.
2. Erebuz returns a quote from each available privacy pool, with the guaranteed output.
3. The sender picks a route.
4. Circle CCTP moves native USDC between the required chains.
5. The selected pool breaks the public link between sender and recipient.
6. The recipient receives native USDC on the destination chain.

The quoted output is what the recipient receives. Destination-leg CCTP fees are read from Circle's published per-route schedule rather than estimated, because they vary by an order of magnitude across chains — 0 bps out of Arc, 1 bps out of Ethereum Sepolia, 14 bps out of Starknet — and a fixed estimate cannot keep `delivered ≥ quoted` on all of them.

## Starknet / STRK20 status

Starknet is supported as a **hub and a destination**, not as a source: source deposits land on a per-route ERC-7579 smart account, which has no Starknet equivalent here.

**Working and validated on testnet.** CCTP v2 on Starknet (domain 25), both directions. Three things differ from every EVM chain and are handled in [`packages/tee/src/services/cctp/starknet.ts`](packages/tee/src/services/cctp/starknet.ts):

- `TokenMessengerV2` and `TokenMinterV2` are a single `TokenMessengerMinterV2` contract.
- `message` and `attestation` are Cairo `ByteArray`s, not EVM `bytes`.
- Addresses are 252-bit felts, so a `bytes32` mint recipient is a plain left-pad. The EVM-shaped pad silently truncates a felt and sends funds to an address nobody can sign for, so `assertMintRecipientShape` refuses that burn outright.

Verify the whole path without moving funds:

```bash
pnpm --filter @erebuz/tee test:cctp:starknet -- --preflight
```

That checks the contracts, the CCTP wiring, the Cairo encoder against starknet.js, and the message decoder. Then run a real transfer with `--direction=roundtrip`.

**Not yet wired: the pool hop.** Depositing into the STRK20 pool requires a STARK proof. Proofs come from a proving service, and no public endpoint is published; the reference client takes the URL from configuration and there is no self-hostable prover in the open-source SDK. Until `STRK20_PROVING_SERVICE_URL` and `STRK20_INDEXER_URL` are configured, a STRK20 route **pauses on the hub instead of completing** — finishing without the privacy hop would deliver the funds while silently removing the only property the route sells. See [`packages/tee/src/services/strk20-pool/index.ts`](packages/tee/src/services/strk20-pool/index.ts).

`STRK20_TRANSPORT_ONLY=true` completes such a route over pure CCTP with **no privacy hop**. It exists for demonstrating the transport and is not a private transfer.

## Demo stack

| Role | Network or protocol |
| --- | --- |
| Source | <img src="apps/app/public/chains/base.jpg" alt="Base" width="24" /> Base Sepolia (any EVM CCTP chain) |
| Asset | <img src="apps/landing/public/content/start/assets/images/USDC.png" alt="USDC" width="24" /> USDC |
| Transport | Circle CCTP v2 |
| Privacy | Railgun · Erebuz Privacy Pool · STRK20 |
| Destination | <img src="apps/app/public/chains/Arc.jpg" alt="Arc" width="24" /> Arc Testnet, <img src="apps/app/public/chains/arbitrum.jpg" alt="Arbitrum" width="24" /> Arbitrum Sepolia, and the other CCTP testnets |

Erebuz keeps transport and privacy separate. CCTP handles native USDC movement, while privacy pools compete as routes. Users get a clear quote and remain in control of the path.

## Layout

| Path | What it is |
| --- | --- |
| `apps/app` | the transfer UI: quote → route → deposit → live status |
| `packages/tee` | the orchestrator: quote/create/status API, per-route state machine, CCTP, Railgun, pool adapters |
| `infra/stack` | one-command backend (orchestrator + Railgun POI node + Mongo + Arc ASP) |
| `privacy-pool-arc` | the Erebuz Privacy Pool deployment on Arc (submodule) |

## Running it

```bash
pnpm install
pnpm --filter @erebuz/tee start     # the orchestrator
pnpm app                            # the UI, pointed at it
```

The orchestrator needs a funded signer plus, per route, the relevant pool configuration. `infra/stack/.env.example` documents every variable.
