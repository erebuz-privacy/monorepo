# Erebuz — Full Context

## What is Erebuz

Erebuz is a full-stack privacy middleware SDK that sits between any app or wallet and the blockchain. It abstracts away the complexity of private transactions — routing, compliance, bridging, gas — into a single SDK call. The developer calls `findRoute()` and Erebuz handles everything underneath: picking the best privacy tool, best bridge, running compliance checks, and executing the transaction — all without compromising UX.

The core thesis: privacy is a shared infrastructure problem, not something every app should build themselves. Erebuz lets any app borrow privacy instead of building it.

## The Core Architecture

```
[App] ─────────────────────────────────┐
                    findRoute()         ▼
                               ┌─────────────────┐
[Wallet] ──────────────────── │   Erebuz SDK     │
                    findRoute() └────────┬────────┘
                                        │ Routing fee
                          ┌─────────────┼──────────────┐
                          ▼             ▼              ▼
                       Privacy      Compliance       DeFi
                    (best tool)    (best tool)    (best bridge)
```

Two inputs: App or Wallet, both call `findRoute()`. Erebuz SDK sits in the middle, takes a routing fee, and routes to the best available tool across three pillars — Privacy, Compliance, DeFi/Bridges.

## The Three Pillars

### 1. Privacy
Erebuz does not lock you into one privacy mechanism. It picks the best tool for the transaction depending on chain, amount, speed, and cost. Current integrations:
- **Railgun** — shared privacy pool on Ethereum, best for EVM chains, already audited
- **STRK20** — StarkNet-based private transfers
- **Zcash** — shielded transactions, own chain, battle-tested
- **Monero** — privacy by default, ring signatures
- **Aztec / others** — ZK-based private execution

The app developer never needs to know which tool ran. They just get a private transaction.

### 2. Compliance
Every transaction is screened before it moves. Erebuz integrates:
- **Chainalysis KYT** — real-time transaction monitoring
- **Elliptic** — cross-chain tracing, token coverage
- **Scorechain** — AML and risk scoring

Privacy and compliance run inside the same TEE (secure box). They don't fight each other — they coexist by design. The compliance check happens before the privacy layer executes, so the transaction is clean before it's hidden.

### 3. DeFi / Bridges
Erebuz picks the best bridge or swap route depending on liquidity, speed, and fees:
- **Anoma** — intent-based architecture
- **0x Protocol** — DEX aggregation
- **Heliswap / others** — cross-chain liquidity

## The TEE — Secure Box

Each app that integrates Erebuz runs its own TEE (Trusted Execution Environment). This is a locked area on a computer that even the machine's owner cannot look inside. Inside the TEE:
- User viewing keys are stored and never exposed
- Compliance and KYT checks run
- Payment signing happens
- Cross-chain routing logic executes

The TEE can be self-hosted by the app or Erebuz-hosted. Same SDK, stronger trust when self-hosted.

## The Indexer

A shared Indexer serves private balances. It uses ORAM (Oblivious RAM) so even the lookup itself is hidden — the Indexer cannot tell which user or balance is being queried. Apps can use the shared Erebuz Indexer or run their own.

## Gas — Solved

Private balances are useless if you need a public wallet to pay gas. Erebuz fixes this:
- User pays from inside the private pool
- App's TEE signs a note: "real user paid"
- Erebuz countersigns: "this app is settled"
- A paymaster contract on each chain verifies the note
- A shared relayer sends the transaction and pays gas
- User never holds gas, never leaves a public trail

## Privacy Model — Who Sees What

Erebuz never sees users. The app is the wall.

```
User → App (TEE) → Erebuz
```

Users never talk to Erebuz directly. The app batches payments to Erebuz, so no single user action lines up in time with a payment. That's structural privacy, not just a policy.

**What Erebuz never learns:**
- Who your users are
- How many users you have
- Which user did what
- Amounts or timing per user

**What Erebuz only sees:**
- That your app exists
- The app's batched payments
- That a valid app approved a transaction

## The SDK

```js
import { Erebuz } from "@erebuz/sdk";

const erebuz = Erebuz.init({
  box: "self-hosted",
  indexer: "erebuz-hosted",
  apiKey: process.env.EREBUZ_API_KEY,
});

await erebuz
  .privacy({ mode: "confidential" })
  .compliant({ kyt: true, sanctions: true })
  .send({ from: "polygon", to: "arbitrum", token: "USDC", amount: 100 });

// Returns:
// {
//   status:           "confirmed",
//   time:             "1.2s",
//   fees:             "$0.04",
//   route:            "Polygon → Railgun Pool → Arbitrum",
//   privacy:          "confidential",
//   traceable:        true,
//   compliancy_score: 98,
//   sanction_check:   "passed",
//   kyt_flag:         "clean",
// }
```

One master seed generates every key on every chain. One balance call returns private balance across all chains. One `send()` call handles routing, privacy, compliance, and gas.

## Why Not Build It Yourself

| | Build yourself | Erebuz |
|---|---|---|
| Cost year one | $2M–$3.5M | $50K–$200K |
| Time to launch | 12–18 months | 2–6 weeks |
| Privacy pool | Small, separate | Large, shared |
| Audit risk | High, custom crypto | Low, no custom crypto |

## Who It's For

Any app that handles user funds and wants to give users privacy without becoming a crypto company:
- Wallets
- DEX exchanges
- Payment apps
- DeFi protocols
- Cross-chain bridges
- Games with onchain economies

## Current Status
- Whitepaper v0.2 published
- SDK in development
- TEE runtime being built
- Railgun as primary privacy layer
- Target chains: Ethereum, Arbitrum, Base, Polygon, StarkNet

## One Line
> Erebuz is the privacy router between your app and the chain — private, compliant, and ready in days.
