# @erebuz/ui

Shared [shadcn/ui](https://ui.shadcn.com/docs/monorepo) component library for
the Erebuz monorepo, consumed via `workspace:*` by:

- [`apps/landing`](../apps/landing)
- [`apps/app`](../apps/app) — wall8

Add new components by running the `add` command from inside an app (not from
here) — the CLI resolves the shared `packages/ui` layout automatically:

```bash
cd apps/app
pnpm exec shadcn add <component>
```
