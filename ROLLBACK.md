# Production deploy & rollback runbook

How the `fit` platform ships to production, and exactly how to undo a release
that goes wrong. The deploy pipeline lives in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml); this document is
the operator-facing companion to it.

> **TL;DR rollback:** promote the previous Vercel deployment (instant), redeploy
> the previous Railway API deployment, and — only if a migration corrupted data
> — restore the pre-deploy snapshot with `fit db restore`. Full steps below.

---

## 1. The deploy pipeline

Every merge to `main` runs CI. When CI is green, the deploy workflow executes
this ordered sequence — a failure at any step halts the ones after it:

```
CI green ─▶ snapshot ─▶ migrate ─▶ deploy API (Railway) ─▶ deploy web (Vercel) ─▶ smoke
             │            │              │                        │                 │
          pg_dump      prisma        railway up             vercel deploy      fit services
          → R2 +      migrate        + /health              --prod × 4         health
          artifact    deploy          gate                  (admin, platform,
                                                             web, superadmin)
```

- **snapshot** — `fit db snapshot` runs `pg_dump` (custom format) against the
  production database _before any migration_. The dump is copied to R2
  (`db-snapshots/`) and also uploaded as a 14-day workflow artifact. **This is
  the rollback target.**
- **migrate** — `prisma migrate deploy` applies pending migrations. Because it
  runs before the new API image goes live, migrations must be
  **forward-compatible** (the currently-deployed API must tolerate the new
  schema).
- **deploy API** — `railway up` builds and releases the NestJS service, then the
  workflow polls `GET /health` until it returns `200`.
- **deploy web** — the four Next.js apps deploy to their Vercel projects in
  parallel (`fail-fast: false`).
- **smoke** — `fit services health` re-probes Postgres, Redis, the API, and R2.

If the deploy secrets are not configured, the `guard` job marks the run
**skipped** rather than failing (see [§6](#6-required-secrets--variables)).

---

## 2. When to roll back

| Symptom                                         | Roll back                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| Frontend broken / bad bundle, DB & API fine     | Vercel only ([§3](#3-roll-back-the-web-apps-vercel))               |
| API erroring or `/health` red, schema unchanged | Railway only ([§4](#4-roll-back-the-api-railway))                  |
| Bad/incompatible migration, data wrong or lost  | Full rollback incl. DB ([§5](#5-restore-the-database-last-resort)) |

Prefer the narrowest rollback that fixes the incident. A DB restore is the last
resort — it discards everything written since the snapshot.

---

## 3. Roll back the web apps (Vercel)

Vercel keeps every production deployment; rolling back is an **instant alias
promotion** — no rebuild.

**Dashboard:** Project → **Deployments** → pick the last-known-good production
deployment → **⋯ → Promote to Production**.

**CLI** (per affected app):

```bash
vercel ls <project> --prod --token="$VERCEL_TOKEN"          # list recent prod deployments
vercel promote <deployment-url> --token="$VERCEL_TOKEN"     # promote the good one
```

Repeat for each of `admin`, `platform`, `web`, `superadmin` that shipped in the
bad release. Verify the domain serves the restored build.

---

## 4. Roll back the API (Railway)

Railway retains previous deployments and can redeploy one in place.

**Dashboard:** API service → **Deployments** → last-known-good → **Redeploy**.

**CLI:**

```bash
railway status                         # confirm the target service/environment
railway deployments --service api      # find the previous good deployment id
railway redeploy <deployment-id>       # or `railway rollback` for the immediate previous
```

Then confirm health:

```bash
curl -fsS "$PROD_API_URL/health"       # expect {"db":"ok","redis":"ok"} and HTTP 200
# or, with the repo env loaded:
pnpm fit services health
```

Redeploying the previous image **does not undo a migration** — if the release
included a schema change, continue to [§5](#5-restore-the-database-last-resort).

---

## 5. Restore the database (last resort)

Only when a migration corrupted or dropped data. This **overwrites** the
production database with the pre-deploy snapshot and discards everything written
since. Announce downtime first.

1. **Stop writers.** Scale the Railway API to 0 (or enable maintenance mode) so
   nothing writes mid-restore.

2. **Locate the snapshot** taken at the start of the bad deploy:
   - R2: `s3://<R2_BUCKET>/db-snapshots/fit-<sha>.dump`
   - or the `db-snapshot-<sha>` GitHub Actions artifact from that run.

3. **Restore** (custom-format dump, applied in a single transaction):

   ```bash
   export DATABASE_URL="<PROD_DATABASE_URL>"
   export R2_ACCOUNT_ID=… R2_BUCKET=… \
          AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… AWS_DEFAULT_REGION=auto

   pnpm fit db restore "s3://$R2_BUCKET/db-snapshots/fit-<sha>.dump"
   # from a local artifact instead:
   pnpm fit db restore ./fit-<sha>.dump
   ```

   `fit db restore` runs `pg_restore --clean --if-exists --single-transaction`,
   so it drops existing objects and reloads atomically — a failure leaves the DB
   untouched rather than half-restored.

4. **Re-point the code.** Redeploy the API build whose schema matches the
   snapshot ([§4](#4-roll-back-the-api-railway)) — restoring an old schema under
   new code will not boot cleanly.

5. **Bring writers back** and verify:

   ```bash
   pnpm db:status            # migration state matches the restored schema
   pnpm fit services health  # db + redis + api + r2 all ok
   ```

---

## 6. Required secrets & variables

Set on the GitHub `production` environment. When any of `RAILWAY_TOKEN`,
`VERCEL_TOKEN`, or `PROD_DATABASE_URL` is missing, the pipeline **skips** (it
does not fail).

**Secrets**

| Name                                                             | Used by                  |
| ---------------------------------------------------------------- | ------------------------ |
| `PROD_DATABASE_URL`                                              | snapshot, migrate, smoke |
| `PROD_REDIS_URL`                                                 | smoke                    |
| `RAILWAY_TOKEN`                                                  | deploy API               |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`                                  | deploy web               |
| `VERCEL_PROJECT_ID_ADMIN` / `_PLATFORM` / `_WEB` / `_SUPERADMIN` | deploy web (per app)     |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`      | snapshot upload          |

**Variables**

| Name                         | Used by                    |
| ---------------------------- | -------------------------- |
| `PROD_API_URL`               | API health gate, smoke     |
| `RAILWAY_SERVICE` (opt.)     | deploy API (default `api`) |
| `R2_BUCKET`, `R2_PUBLIC_URL` | snapshot, smoke            |

---

## 7. Rollback rehearsal

The procedure above was rehearsed end-to-end against a disposable staging
database/project (never production) to verify each step actually works.

**Snapshot → mutate → restore (database), staging:**

```console
$ pnpm fit db snapshot --out fit-rehearsal.dump
{"ok":true,"file":"fit-rehearsal.dump","uploaded":"s3://fit-staging/db-snapshots/fit-rehearsal.dump"}

$ psql "$DATABASE_URL" -c "delete from \"Gym\" where slug = 'downtown';"
DELETE 1

$ pnpm fit db restore fit-rehearsal.dump
{"ok":true,"restoredFrom":"fit-rehearsal.dump"}

$ psql "$DATABASE_URL" -c "select count(*) from \"Gym\" where slug = 'downtown';"
 count
-------
     1          # row is back — restore verified
```

**API rollback (staging):** deployed a deliberately broken build, confirmed the
`/health` gate went red, then `railway redeploy <previous-id>` and re-probed —
`{"db":"ok","redis":"ok"}`, HTTP 200 restored.

**Web rollback (staging):** promoted the prior `admin` production deployment with
`vercel promote <url>`; the alias flipped and the previous bundle served
immediately, no rebuild.

**Findings baked into this runbook:**

- Restore must run under the schema-matching API build — restoring an old schema
  under new code fails to boot (→ [§5](#5-restore-the-database-last-resort) step 4).
- The R2 copy is not sufficient alone: it is skipped when R2 is unconfigured, so
  the pipeline also keeps a 14-day GitHub artifact as a second copy.

Re-run this rehearsal against staging whenever the deploy pipeline or the
snapshot/restore commands change.
