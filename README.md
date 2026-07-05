# fit

[![CI](https://github.com/fitspace676-ctrl/fit/actions/workflows/ci.yml/badge.svg)](https://github.com/fitspace676-ctrl/fit/actions/workflows/ci.yml)

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
│   ├── web/        # @fit/web        — public tenant web client (Next.js)
│   ├── admin/      # @fit/admin      — gym staff admin console (Next.js)
│   ├── platform/   # @fit/platform   — marketing + owner signup, root domain (Next.js)
│   ├── superadmin/ # @fit/superadmin — platform operator console, SUPER_ADMIN-only (Next.js)
│   ├── mobile/     # @fit/mobile     — mobile client (Expo / React Native)
│   └── api/        # @fit/api        — backend API service
├── packages/
│   ├── db/         # @fit/db         — Prisma client + schema/migrations
│   ├── env/        # @fit/env        — zod-based environment + secrets validation
│   ├── ui-web/     # @fit/ui-web     — shared web UI components
│   ├── ui-mobile/  # @fit/ui-mobile  — shared mobile UI components
│   ├── types/      # @fit/types      — shared TypeScript types
│   ├── utils/      # @fit/utils      — shared utilities
│   ├── i18n/       # @fit/i18n       — translations and i18n helpers
│   └── config/     # @fit/config     — shared tsconfig/eslint/prettier/tailwind presets
├── tools/
│   └── cli/        # @fit/cli        — the `fit` CLI (infra/env introspection)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

> Phases 1–2 (foundation/infra + auth & multi-tenancy) are implemented; feature phases build on top.

## Database

Persistence is Postgres (via [Prisma](https://www.prisma.io/) in `@fit/db`) plus
Redis for caching/queues. Production runs both on [Railway](https://railway.app);
local development can use either Railway or the bundled Docker stack.

### Configure connection strings

```bash
cp .env.example .env.local                 # repo-level shared infra vars
cp packages/db/.env.example packages/db/.env  # Prisma reads DATABASE_URL from here
```

Fill in `DATABASE_URL` and `REDIS_URL`:

- **Railway** — in the Railway dashboard open the Postgres/Redis service →
  **Variables** and copy the **public** proxy URLs (`DATABASE_PUBLIC_URL`,
  `REDIS_PUBLIC_URL`). The public URLs are required when connecting from outside
  Railway's private network (e.g. your laptop or CI).
- **Local Docker** — use the defaults already present in the example files.

`.env` / `.env.*` are gitignored; only the `.env.example` templates are committed.

### Local offline dev (Docker fallback)

When you can't reach Railway, run Postgres + Redis locally:

```bash
docker compose up -d          # start fit-postgres (:5432) and fit-redis (:6379)
pnpm db:migrate               # apply migrations to the local database
docker compose down           # stop (add -v to wipe data volumes)
```

### Database scripts

Run from the repo root:

| Command               | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `pnpm db:generate`    | Generate the typed Prisma client into `packages/db/generated/` |
| `pnpm db:migrate`     | Apply pending migrations (`prisma migrate deploy`)             |
| `pnpm db:migrate:dev` | Create + apply a new migration in development                  |
| `pnpm db:studio`      | Open Prisma Studio against the configured database             |
| `pnpm db:status`      | Show migration status (`prisma migrate status`)                |

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

## Deployment

Production is **Railway** (Postgres, Redis, the NestJS API) + **Vercel** (the
four Next.js apps) + **Cloudflare R2** (uploads and DB snapshots). Merges to
`main` that pass CI trigger [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which runs an ordered release:

```
snapshot ─▶ migrate ─▶ deploy API (Railway) ─▶ deploy web ×4 (Vercel) ─▶ smoke
```

A pre-deploy `pg_dump` (via `pnpm fit db snapshot`) is taken before any
migration, so a bad release can be rolled back to a known-good database. The
full deploy sequence, the required GitHub secrets/variables, and the **rehearsed
rollback** procedure are documented in [`ROLLBACK.md`](ROLLBACK.md).

The pipeline **skips** (rather than fails) until the deploy secrets are
configured, so it is safe to land ahead of the infra wiring.

## `fit` CLI

`fit` is the single, scriptable source of truth for infra/env introspection. Any
task that needs a runtime detail — a connection string, a service's health, a
signed upload URL, a test token — fetches it from `fit` instead of hardcoding it.
It wraps the vendor CLIs (`railway`, `vercel`, `wrangler`, `eas`, `prisma`) and
reads env through the **same Zod schema as the apps** (`@fit/env`).

Run it from anywhere in the repo (output is JSON by default; add `--pretty`):

```bash
pnpm fit env get DATABASE_URL          # one schema-validated value
pnpm fit env check                     # validate the whole infra environment
pnpm fit services health               # probe Postgres / Redis / API / R2
pnpm fit token --role MANAGER --gym demo
pnpm fit r2 config                     # storage config (credentials redacted)
pnpm fit deploy web --env prod         # wraps the app's vendor CLI
```

See [`tools/cli/README.md`](tools/cli/README.md) for the full command catalog.
