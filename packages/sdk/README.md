# @erebuz/sdk

Shared TypeScript library for the Erebuz monorepo.

It is an **internal, source-only package** (no build step) consumed via the
`workspace:*` protocol by:

- [`apps/app`](../../apps/app) — the wall8 frontend (transpiled through
  Next.js `transpilePackages`).
- [`contracts`](../../contracts) — deployment / tooling scripts (run with
  `tsx`).

Add shared chain config, types and helpers here so the frontend and on-chain
tooling never drift apart.

```ts
import { createConfig, getChainId, shortenAddress } from "@erebuz/sdk";

const config = createConfig({ chain: "sepolia" });
getChainId(config.chain); // 11155111
shortenAddress("0x1234567890abcdef1234567890abcdef12345678"); // 0x1234…5678
```
