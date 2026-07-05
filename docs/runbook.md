# On-call runbook

The operator-facing playbooks for the five incidents most likely to page someone
at 03:00. Each is a self-contained loop: **detect → triage → mitigate → verify →
escalate**. It assumes only the [`fit` CLI](../tools/cli) (`pnpm fit …`), the
Sentry dashboards described in [`monitoring.md`](./monitoring.md), and the vendor
consoles (Railway, Vercel, Cloudflare).

This document is the companion to two others — read them once before you are
on-call:

- [`ROLLBACK.md`](../ROLLBACK.md) — the deploy pipeline and how to undo a release.
- [`monitoring.md`](./monitoring.md) — Sentry projects, uptime probes, and the
  alert rules that page you (referenced by name below).

> **First move for _any_ page:** run the one command that shows the whole system
> at a glance, then jump to the matching playbook.
>
> ```
> pnpm fit services health --pretty      # probes Postgres, Redis, API, R2
> ```
>
> Exit non-zero and a `healthy: false` body point you at the down dependency.

| #   | Incident          | Alert that fires                                         | Jump to                    |
| --- | ----------------- | -------------------------------------------------------- | -------------------------- |
| 1   | API down          | Uptime: API `GET /health` ≠ 200                          | [§1](#1-api-down)          |
| 2   | Failed migration  | Deploy workflow red on **Apply migrations (prod)**       | [§2](#2-failed-migration)  |
| 3   | Billing job stuck | Sentry `job:subscription-renewal` critical / missed-cron | [§3](#3-billing-job-stuck) |
| 4   | R2 outage         | Uptime R2 probe; `services health` → `r2: error`         | [§4](#4-r2-outage)         |
| 5   | Webhook flood     | API error/latency spike on `/webhooks/payments/*`        | [§5](#5-webhook-flood)     |

---

## 1. API down

The NestJS API (Railway) is unreachable or failing its readiness probe. Because
`GET /health` gates load-balancer traffic, this takes every app down with it —
member web, admin, platform, and the mobile app all call the same API.

**Detect**

- Uptime alert: **API `GET /health`** returns non-200 twice at 60 s (see
  `monitoring.md` → Uptime checks).
- Error spike in the `fit-api` Sentry project.

**Triage** — find which dependency broke.

```
pnpm fit services health --pretty
```

`GET /health` returns `{ db, redis }` and answers **503** when either is
`error` (see `apps/api/src/health/health.controller.ts`). Read the body:

- `db: error` → Postgres is the problem. Check the Railway/managed-Postgres
  status and connection count; a migration may hold a lock (see [§2](#2-failed-migration)).
- `redis: error` → Redis is down. Rate limiting, the billing lock, and BullMQ
  depend on it, but the API still boots; expect degraded, not dead.
- both `ok` but the probe still fails → the process itself is down or crash-looping.
  Check Railway deploy logs: `pnpm fit logs api`.

**Mitigate**

1. **Crash-loop after a deploy** → this is a bad release. Roll the API back per
   [`ROLLBACK.md`](../ROLLBACK.md) §"Roll back the API" (redeploy the previous
   Railway deployment). Instant and safe — the API is stateless.
2. **Postgres down / unreachable** → escalate to the DB provider; there is no
   app-side fix. If a migration corrupted data, restore the pre-deploy snapshot
   (`pnpm fit db restore <dump>`, see [§2](#2-failed-migration)).
3. **Redis down** → restart/failover the Redis instance. The API self-heals when
   Redis returns; no redeploy needed.

**Verify** — `pnpm fit services health` exits 0 and the uptime check clears.

**Escalate** if Postgres itself is unhealthy, or a rollback does not restore
`/health` within ~10 min: page the platform owner.

---

## 2. Failed migration

`prisma migrate deploy` failed during a production deploy. The pipeline runs
**snapshot → migrate → deploy API**, and a failure at `migrate` halts everything
after it (see `.github/workflows/deploy.yml`), so the **old API is still live**
against a database that may be half-migrated.

**Detect** — the **Apply migrations (prod)** job in the Deploy workflow is red;
no new API/web deploy followed.

**Triage**

```
pnpm fit db migrate     # shows/attempts pending migrations; read the Prisma error
```

Decide the shape of the failure:

- **Migration errored but rolled back cleanly** (most DDL statements are
  transactional in Postgres) → the schema is unchanged and the old API is fine.
  This is the good case: fix the migration and re-deploy.
- **Migration partially applied** (a non-transactional step, or data was
  mutated) → the schema is inconsistent. Do **not** retry blindly.

**Mitigate**

1. **Clean failure** → fix the migration in a follow-up PR and let the pipeline
   re-run. No data action needed.
2. **Dirty / partial failure** → restore the pre-deploy snapshot, which the
   pipeline captured _before_ migrating:

   ```
   pnpm fit db restore s3://…/db-snapshots/fit-<sha>.dump   # or the workflow artifact
   ```

   The dump is in R2 under `db-snapshots/` and also attached to the failed run as
   the `db-snapshot-<sha>` artifact (14-day retention). Full steps and cautions
   are in [`ROLLBACK.md`](../ROLLBACK.md) §"Restore the database".

**Why this is usually low-drama:** migrations are required to be
**forward-compatible** (the currently-deployed API must tolerate the new schema),
so a failed migration leaves the _previous_ API serving traffic normally. The
incident is "the deploy is blocked", not "the site is down" — unless a partial
migration corrupted data, which is what the snapshot exists for.

**Verify** — `pnpm fit db migrate` reports no pending/failed migrations and
`services health` shows `db: ok`.

**Escalate** to the schema author before any `db restore`; a restore discards all
writes since the snapshot.

---

## 3. Billing job stuck

The daily recurring-subscription sweep
(`SubscriptionBillingService.runBillingCycle`, `@Cron` at **02:00** server time)
did not complete, or completed with charge errors. It renews due memberships,
works declines through the dunning ladder, and expires the unrecoverable ones
(see [`docs/adr/subscription-billing-job.md`](./adr/subscription-billing-job.md)).

**Detect** (see `monitoring.md` → Job failures)

- **Critical** — a Sentry event tagged `job:subscription-renewal`: the sweep
  threw and did not finish.
- **Missing** — the Sentry Cron monitor for `subscription-renewal` (`0 2 * * *`)
  reports a **missed** run: the job never fired.
- **Warning** — "billing completed with errors": some charges failed on
  infrastructure faults and will retry next pass. Usually **no action** — the job
  is self-healing (below).

**Triage** — is billing even enabled here?

```
pnpm fit env get SUBSCRIPTION_BILLING_ENABLED --env prod
```

It defaults to `false` everywhere; only production with a real payment provider
turns it on. If it is `false`, the sweep is intentionally inert — the alert is a
misconfiguration, not an incident.

**Key facts before you touch anything** — the job is designed to be safe to
re-run:

- **Per-day Redis lock** (`SET NX`, 1 h TTL) means only one replica runs the
  sweep. A stale lock from a crashed run can block the _next_ day's run.
- **Database idempotency** — every transition is a conditional `updateMany` on the
  observed `(currentPeriodEnd, status)`, and each charge carries a per-period
  idempotency key. **Re-running cannot double-charge or double-advance** a
  subscription. This is what makes recovery safe.
- An `error` bucket is an _infrastructure_ fault (gateway/DB), not a decline; that
  member was left untouched and is retried next pass — never penalised.

**Mitigate**

1. **Completed-with-errors (warning only)** → do nothing. The affected rows are
   picked up on the next daily pass or the dunning-ladder retry
   (`SUBSCRIPTION_BILLING_RETRY_OFFSET_DAYS`, default `2,5,7`).
2. **Threw / missed the run** → find the cause in the `fit-api` Sentry event
   (provider unreachable? DB write failing?). Fix the dependency. Because of
   idempotency you can **safely re-trigger** the sweep once the dependency is
   healthy — a re-run no-ops every already-processed subscription and only picks
   up the ones still due.
3. **Stale Redis lock** blocking a fresh run → confirm no sweep is actually
   running (`pnpm fit services health` for Redis; check `fit-api` logs), then
   clear the day's lock key in Redis so the next run can acquire it.

**Verify** — re-run's `BillingCycleSummary` in the logs balances
(`subscriptionsDue = renewed + pastDue + expired + canceled + errors`) with
`errors: 0`, and the Sentry Cron monitor is green.

**Escalate** to the billing owner if charges are erroring against a _live_
gateway (real members are missing renewals), or if you are unsure whether a lock
is stale vs. a run genuinely in progress.

---

## 4. R2 outage

Cloudflare R2 object storage is unreachable. R2 holds uploaded media (gym logos,
trainer/product galleries via `fit r2 sign` presigned uploads), generated invoice
PDFs, and the pre-deploy DB snapshots. The **API keeps serving** — R2 is not a
`/health` hard dependency for boot — but uploads, new invoice PDFs, and
`db snapshot`/`restore` fail.

**Detect**

- Uptime R2 probe fails, or `pnpm fit services health` reports `r2: error`.
- `fit-api` errors on upload-signing / invoice-PDF paths.

**Triage**

```
pnpm fit services health --pretty      # r2 status
pnpm fit r2 config --pretty            # confirms bucket/account/public URL wiring
```

- `r2: error` with valid config → R2 (or the account) is having an outage. Check
  the **Cloudflare status page** and the R2 dashboard for the bucket.
- Config missing/invalid (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) → this is a misconfiguration, not an
  outage. Fix the env and redeploy.

**Mitigate**

1. **Genuine R2/Cloudflare outage** → there is no app-side failover; storage is
   single-region R2. Post status to members if uploads are user-visible, and
   wait out the provider incident. Existing objects served from `R2_PUBLIC_URL`
   may still be reachable via Cloudflare cache even while writes fail.
2. **⚠ If a production deploy is in flight** → the deploy's **pre-deploy snapshot**
   step writes to R2 and will fail. **Do not deploy during an R2 outage** without
   a snapshot: hold the release, or (last resort, emergency only) re-run the
   deploy with the `skip_snapshot` input — accepting that you deploy with **no
   rollback target**. Prefer waiting.
3. **Credentials/permissions issue** → rotate the R2 access key in Cloudflare,
   update the secrets, redeploy.

**Verify** — `pnpm fit services health` shows `r2: ok`; a test presigned upload
(`pnpm fit r2 sign <key>`) succeeds.

**Escalate** to the infra owner for credential rotation or if invoice generation
has been failing (members owed receipts once R2 returns).

---

## 5. Webhook flood

A spike of inbound requests to `POST /webhooks/payments/:provider` — a
misbehaving/retrying gateway, a replayed batch, or abuse. This route is
deliberately **public**: excluded from `TenantMiddleware`, no `TenantGuard`, and
it carries **no `@RateLimit`** (rate limits are explicit opt-ins on abuse-prone
routes; the webhook authenticates by _signature_, not by budget — see
`docs/adr/payment-provider.md`). So a flood is absorbed at the edge and by
signature rejection, not by an app-level throttle.

**Detect** — latency/error spike on `/webhooks/payments/*` in the `fit-api`
Sentry project; elevated request volume in the Cloudflare/Railway metrics.

**Triage**

- Are the requests **authentic**? `handleWebhook` verifies the gateway signature
  and rejects forgeries; a stub deployment (no gateway) answers **501**. A flood
  of `401/400/501` is junk traffic being correctly refused — the risk is _load_,
  not _correctness_. A flood of _valid_ events is the real gateway retrying
  because we returned errors to it.
- Check whether the API is otherwise healthy: `pnpm fit services health`.

**Mitigate**

1. **Junk / forged flood** → throttle at the **edge**. Add a Cloudflare rate-limit
   or WAF rule scoped to the `/webhooks/payments/*` path (and/or the source IPs /
   ASNs). This is the correct layer — it keeps the flood off the origin entirely.
2. **The real gateway retry-storming us** → it is retrying because we returned
   5xx. Find _why_ the handler is failing in the `fit-api` Sentry events (DB
   down? provider misconfig?) and fix that root cause; once we return 200, the
   gateway stops retrying. Do **not** edge-block the real provider's IPs — that
   drops legitimate settlement/dispute events.
3. **Origin saturating** → scale the Railway API up while the edge rule takes
   effect.

**Verify** — request rate on `/webhooks/payments/*` returns to baseline, API
latency/error rate recovers, and `services health` is green.

**Escalate** to the billing owner if _valid_ events are being dropped (settlement
state may now be out of sync with the gateway and need reconciliation), and to
the infra owner to tune the Cloudflare rule.

---

## Command quick-reference

| Need                             | Command                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| Whole-system health              | `pnpm fit services health --pretty`                                |
| Just a report (never non-zero)   | `pnpm fit services status --pretty`                                |
| Pending/failed migrations        | `pnpm fit db migrate`                                              |
| Restore DB from snapshot         | `pnpm fit db restore <file\|s3://…>`                               |
| BullMQ queue state / retry a job | `pnpm fit queue status [<queue>]` · `pnpm fit queue retry <jobId>` |
| R2 wiring / test presign         | `pnpm fit r2 config` · `pnpm fit r2 sign <key>`                    |
| Read a prod env value            | `pnpm fit env get <KEY> --env prod`                                |
| Tail an app's logs               | `pnpm fit logs <app>`                                              |

All `fit` output is JSON; add `--pretty` for human-readable indentation. See
[`ROLLBACK.md`](../ROLLBACK.md) for the full deploy/rollback procedure and
[`monitoring.md`](./monitoring.md) for the alert definitions referenced above.
