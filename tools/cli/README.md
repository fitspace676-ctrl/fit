# @fit/cli — the `fit` command

A thin, **scriptable, non-interactive** CLI that is the single source of truth
for infra/env introspection in this monorepo. Any task that needs a runtime
detail — a connection string, a service's health, a signed upload URL, a test
token — fetches it from `fit` instead of hardcoding it.

`fit` wraps the vendor CLIs (`railway`, `vercel`, `wrangler`, `eas`, `prisma`)
and adds project introspection on top. It reads environment variables through
the **same Zod schema as the apps** (`@fit/env`'s `infraEnvSchema`), so values
are always validated and never diverge from what the services boot with.

## Running

From anywhere in the repo:

```bash
pnpm fit <command> [args] [--pretty]
```

`pnpm fit` runs the TypeScript entry directly via `tsx` (no build step). The
package also exposes a `fit` bin for `pnpm --filter @fit/cli exec fit …`.

## Output

All output is **JSON by default** (compact, single line) so scripts can pipe it
into `jq`. Pass `--pretty` for indented, human-readable JSON. Commands exit
non-zero on failure (missing/invalid env, unreachable service, a vendor CLI not
installed, …) and print a structured `{ "ok": false, "error", "code" }` payload
to stderr.

## Commands

| Command                                                            | Description                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `fit env get <KEY> [--env local\|preview\|prod]`                   | Print one schema-validated env value (non-zero if missing/invalid).                   |
| `fit env check [--env …]`                                          | Validate the whole infra environment; lists set keys (never their values).            |
| `fit db url`                                                       | Print the resolved `DATABASE_URL`.                                                    |
| `fit db migrate\|studio\|seed\|reset`                              | Database lifecycle (wraps the root `db:*` scripts / Prisma).                          |
| `fit db snapshot [--out <file>]`                                   | Pre-deploy `pg_dump` (custom format); copies to R2 when configured. Used by deploy.   |
| `fit db restore <file\|s3://…>`                                    | Restore the DB from a dump (`pg_restore`); the rollback half of a bad migration.      |
| `fit services status\|health`                                      | Probe Postgres, Redis, API `/health`, and R2. `health` exits non-zero if any is down. |
| `fit token --role <ROLE> --gym <slug> [--sub <id>] [--ttl <secs>]` | Mint an HS256 JWT signed with the shared `JWT_SECRET`.                                |
| `fit r2 config`                                                    | Report R2 configuration (credentials redacted).                                       |
| `fit r2 sign <key> [--content-type <type>]`                        | Presigned upload URL (delegates to the API's `POST /uploads`).                        |
| `fit queue status [<queue>]`                                       | BullMQ backend reachability + queue list.                                             |
| `fit queue retry <jobId>`                                          | Re-enqueue a failed job (once workers are provisioned).                               |
| `fit deploy <app> [--env preview\|prod]`                           | Deploy an app (wraps `vercel` / `railway` / `eas`).                                   |
| `fit logs <app>`                                                   | Tail an app's logs.                                                                   |
| `fit gym create --name <name> --slug <slug>` / `fit gym list`      | Tenant provisioning helpers (wrap the API).                                           |

`<app>` is one of `web`, `admin`, `platform`, `superadmin` (→ Vercel), `api`
(→ Railway), or `mobile` (→ EAS).

## Environment sources

`--env local` reads `.env` then `.env.local` from the repo root; `preview` /
`prod` read `.env.preview` / `.env.production`. In every case `process.env`
takes precedence last — that's where CI or a `vercel env pull` / `railway run`
injects the real remote values, so `fit` reads exactly what the apps boot from.

## Design constraints

- **Single source of truth** — env is validated by the shared `@fit/env` schema;
  there is no second copy of env logic here.
- **Secret-safe** — secret values are only printed by an explicit single-key
  request (`fit env get <SECRET_KEY>`). Bulk commands (`env check`, `r2 config`)
  redact them, and nothing is logged.
- **Non-interactive** — every command is scriptable; there is no TUI.
