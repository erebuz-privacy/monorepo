# @erebuz/contracts

Erebuz smart contracts, built and tested with [Hardhat](https://hardhat.org/).

- **Solidity** lives in [`src/`](./src).
- **Tests** live in [`test/`](./test) and import [`@erebuz/sdk`](../sdk)
  directly, so contract tests and the app share the same chain config/types.
- **Scripts** live in [`scripts/`](./scripts) and also use `@erebuz/sdk`.

## Usage

```bash
pnpm --filter @erebuz/contracts compile
pnpm --filter @erebuz/contracts test
pnpm --filter @erebuz/contracts deploy:local
```
