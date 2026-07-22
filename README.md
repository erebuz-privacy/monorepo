# Erebuz Monorepo

A [pnpm workspace](https://pnpm.io/workspaces) housing the Erebuz apps, smart
contracts and shared packages.

## Structure

```
erebuz-monorepo/
├── apps/
│   ├── landing/    # Marketing site        (Next.js + Tailwind + shadcn/ui)
│   ├── app/        # wall8 — the product    (Next.js + Tailwind + shadcn/ui)
│   ├── docs/       # Documentation         (Next.js + Fumadocs)
│   └── deck/       # Investor deck         (Next.js + Bolt Slides)
├── contracts/      # Smart contracts        (Hardhat, tests use @erebuz/sdk)
└── packages/
    ├── ui/         # @erebuz/ui — shared shadcn/ui component library
    ├── sdk/        # @erebuz/sdk — shared types & helpers
    └── tee/        # @erebuz/tee — TEE service
```

Two shared layers keep things in sync:

- `@erebuz/ui` follows the [official shadcn monorepo pattern](https://ui.shadcn.com/docs/monorepo):
  components live once in `packages/ui` and both apps import them, instead of
  each app carrying its own copy.
- `@erebuz/sdk` is consumed by **app (wall8)** and by **contracts** so the
  frontend and on-chain tooling stay in sync.

```
┌─────────────┐        ┌─────────────┐
│ apps/landing │        │  apps/app    │
│              │        │   (wall8)    │
└──────┬──────┘        └──────┬──────┘
       │                       │  workspace:*
       └───────────┬───────────┘
                    ▼
             ┌─────────────┐
             │ @erebuz/ui   │
             └─────────────┘

                                ┌─────────────┐        ┌─────────────┐
                                │ apps/app     │        │ contracts    │
                                │  (wall8)     │        │             │
                                └──────┬──────┘        └──────┬──────┘
                                       │   workspace:*         │
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
pnpm docs           # run documentation site (apps/docs, port 3001)
pnpm deck           # run investor deck (apps/deck, port 3002)
pnpm tee            # run TEE service (packages/tee)

pnpm dev            # run all workspace dev scripts in parallel
pnpm build          # build every package in dependency order
pnpm lint           # lint every package
```

Add a new shadcn/ui component (run from inside an app; the CLI resolves the
shared `packages/ui` layout automatically):

```bash
cd apps/app
pnpm exec shadcn add <component>
```

## Packages

| Package             | Path           | Description                                  |
| ------------------- | -------------- | --------------------------------------------- |
| `@erebuz/landing`   | `apps/landing` | Marketing / landing site                      |
| `@erebuz/app`       | `apps/app`     | wall8 — the main product app                  |
| `@erebuz/contracts` | `contracts`    | Solidity contracts (Hardhat), tests use sdk   |
| `@erebuz/ui`        | `packages/ui`  | Shared shadcn/ui component library            |
| `@erebuz/sdk`       | `packages/sdk` | Shared types, chain config and helpers        |

Target a single package with pnpm's `--filter`:

```bash
pnpm --filter @erebuz/app dev
pnpm --filter @erebuz/contracts test
```
