# fit

Monorepo for the **fit** platform, managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/repo).

## Prerequisites

| Tool  | Version  | Notes                                                 |
| ----- | -------- | ----------------------------------------------------- |
| Node  | `>=20`   | LTS recommended                                       |
| pnpm  | `9.15.4` | Pinned via `packageManager`; use `corepack` to get it |
| Turbo | `^2.3.3` | Installed as a workspace dev dependency               |

Enable pnpm through Corepack (ships with Node):

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Quickstart

```bash
pnpm install              # resolve and link all workspaces
pnpm turbo run build      # build every app and package
```

## Layout

```
fit/
├── apps/
│   ├── web/        # @fit/web        — public web client (Next.js)
│   ├── admin/      # @fit/admin      — admin console (Next.js)
│   ├── mobile/     # @fit/mobile     — mobile client (Expo / React Native)
│   └── api/        # @fit/api        — backend API service
├── packages/
│   ├── db/         # @fit/db         — Prisma client + schema/migrations
│   ├── ui-web/     # @fit/ui-web     — shared web UI components
│   ├── ui-mobile/  # @fit/ui-mobile  — shared mobile UI components
│   ├── types/      # @fit/types      — shared TypeScript types
│   ├── utils/      # @fit/utils      — shared utilities
│   ├── i18n/       # @fit/i18n       — translations and i18n helpers
│   └── config/     # @fit/config     — shared tsconfig/eslint/prettier/tailwind presets
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

> The `apps/` and `packages/` directories currently hold placeholder stubs; each is fleshed out in a later task.

## Scripts

Run from the repo root — Turbo fans each task out across all workspaces:

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `pnpm build`      | `turbo run build` across all workspaces |
| `pnpm dev`        | `turbo run dev` (persistent, uncached)  |
| `pnpm lint`       | `turbo run lint`                        |
| `pnpm test`       | `turbo run test`                        |
| `pnpm type-check` | `turbo run type-check`                  |

## Pipeline

`turbo.json` defines `build`, `lint`, `type-check`, `test`, `dev`, and `clean`. The
build-dependent tasks declare `dependsOn: ["^build"]` so upstream workspace packages
build before their consumers.
