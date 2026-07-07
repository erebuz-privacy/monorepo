# Erebuz Monorepo

A [pnpm workspace](https://pnpm.io/workspaces) housing the Erebuz apps, smart
contracts and shared SDK.

## Structure

```
erebuz-monorepo/
├── apps/
│   ├── landing/    # Marketing site        (Next.js + Tailwind + shadcn/ui)
│   └── app/        # wall8 — the product    (Next.js + Tailwind + shadcn/ui)
├── contracts/      # Smart contracts        (Hardhat, tests use @erebuz/sdk)
└── sdk/            # @erebuz/sdk — shared types & helpers
```

`@erebuz/sdk` is the shared layer: it's consumed by **app (wall8)** and by
**contracts** so the frontend and on-chain tooling stay in sync.

```
        ┌─────────────┐        ┌─────────────┐
        │ apps/app     │        │ contracts    │
        │  (wall8)     │        │             │
        └──────┬──────┘        └──────┬──────┘
               │   workspace:*        │
               └────────┬─────────────┘
                        ▼
                 ┌─────────────┐
                 │ @erebuz/sdk  │
                 └─────────────┘
```

## Prerequisites

- Node.js `>= 20`
- pnpm `>= 10` (`corepack enable`)

## Getting started

```bash
pnpm install

pnpm landing        # run the landing site (apps/landing)
pnpm app            # run wall8          (apps/app)

pnpm build          # build every package in dependency order
pnpm lint           # lint every package
```

## Packages

| Package            | Path          | Description                                  |
| ------------------ | ------------- | -------------------------------------------- |
| `@erebuz/landing`  | `apps/landing`| Marketing / landing site                     |
| `@erebuz/app`      | `apps/app`    | wall8 — the main product app                 |
| `@erebuz/contracts`| `contracts`   | Solidity contracts (Hardhat), tests use sdk  |
| `@erebuz/sdk`      | `sdk`         | Shared types, chain config and helpers       |

Target a single package with pnpm's `--filter`:

```bash
pnpm --filter @erebuz/app dev
pnpm --filter @erebuz/contracts test
```
