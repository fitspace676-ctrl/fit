# Monitoring, alerting & release tagging

How Fit is observed in production: error reporting (Sentry) across every
service, a release tagged on each deploy, uptime probes, and the alert rules
that page a human. This is the reference the on-call runbook (T10.5) links to.

Everything here is **fail-soft**: no DSN, no auth token, or no monitor
configured degrades to "no reporting", never to a broken build or deploy. The
repo ships inert and lights up as each secret is added.

## Services & Sentry projects

Each deployable is its own Sentry project under the `forma-0r` org
(`https://de.sentry.io/`):

| Service           | Sentry project   | SDK              | Bootstrap                                     |
| ----------------- | ---------------- | ---------------- | --------------------------------------------- |
| API (NestJS)      | `fit-api`        | `@sentry/nestjs` | `apps/api/src/instrument.ts` (imported first) |
| Member web        | `fit-web`        | `@sentry/nextjs` | `instrumentation.ts` + `app/sentry-init.tsx`  |
| Admin console     | `fit-admin`      | `@sentry/nextjs` | `instrumentation.ts` + `app/sentry-init.tsx`  |
| Platform / signup | `fit-platform`   | `@sentry/nextjs` | `instrumentation.ts` + `app/sentry-init.tsx`  |
| Operator console  | `fit-superadmin` | `@sentry/nextjs` | `instrumentation.ts` + `app/sentry-init.tsx`  |
| Mobile (Expo)     | —                | `sentry-expo`    | `apps/mobile/app/_layout.tsx`                 |

For the Next.js apps, `instrumentation.ts#register()` initialises the
server/edge SDK and re-exports `onRequestError` (Server Component / route-handler
errors), while `app/sentry-init.tsx` boots the browser SDK from the root layout.
The `error.tsx` / `global-error.tsx` boundaries call `Sentry.captureException`
and surface the returned event id as the user-visible "Reference", so a support
ticket maps straight to a Sentry event. All of it no-ops until the DSN vars are
set — see each app's `.env.example`.

### Environment variables

| Var                              | Scope         | Purpose                                   |
| -------------------------------- | ------------- | ----------------------------------------- |
| `SENTRY_DSN`                     | server/edge   | SSR + route-handler + API error reporting |
| `SENTRY_ENVIRONMENT`             | server/edge   | environment label (production/preview)    |
| `NEXT_PUBLIC_SENTRY_DSN`         | browser       | client error reporting (inlined)          |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | browser       | environment label (inlined)               |
| `SENTRY_RELEASE`                 | runtime/build | tags events with the deployed commit      |
| `SENTRY_AUTH_TOKEN`              | build/CI only | source-map upload + release creation      |

## Releases per deploy

Every production deploy tags a Sentry release named after the deployed git
commit (`github.sha`). This is what powers "first seen in release X",
regression detection, and suspect-commit attribution.

The deploy pipeline (`.github/workflows/deploy.yml`) does three things:

1. **API runtime tag** — sets `SENTRY_RELEASE` on the Railway service before
   `railway up`, so the running API stamps every event with the release
   (`instrument.ts` reads it).
2. **Web build tag** — passes `SENTRY_RELEASE` and `SENTRY_AUTH_TOKEN` into
   `vercel build`, so the `@sentry/nextjs` bundler plugin stamps the bundles and
   uploads source maps (production stack traces are un-minified).
3. **Release object** — a `sentry-release` job creates, associates commits for
   (`set-commits --auto`), and finalizes the release for all five projects.

The release job is skipped cleanly when `SENTRY_AUTH_TOKEN` is absent; commit
association additionally requires the GitHub repo to be linked in Sentry.

## Uptime checks

Uptime is monitored externally (Sentry Crons/Uptime, or Better Stack) against
the public liveness surfaces — the checks themselves are provider config, not
code, so they are recorded here as the source of truth to reproduce them:

| Target                          | Probe                   | Expect | Interval | Alert after |
| ------------------------------- | ----------------------- | ------ | -------- | ----------- |
| API `GET /health`               | HTTP, body `db`+`redis` | 200    | 60s      | 2 failures  |
| Member web (apex + a tenant)    | HTTP GET `/`            | 200    | 60s      | 2 failures  |
| Admin console `/`               | HTTP GET                | 200    | 300s     | 2 failures  |
| Platform / signup `/`           | HTTP GET                | 200    | 300s     | 2 failures  |
| Operator console `/` (→ `/403`) | HTTP GET, any 2xx/3xx   | <400   | 300s     | 2 failures  |

`GET /health` (`apps/api/src/health/health.controller.ts`) returns 200 only when
both Postgres and Redis are reachable and 503 otherwise, so it is a real
readiness signal, not just "the process is up".

## Alert rules

### Error spikes

Per Sentry project, a metric alert on the **error event rate**:

- **Warning** — error rate ≥ 2× the 1-hour baseline for 5 minutes.
- **Critical** — > 25 errors / 5 minutes, or any single **new** issue in the
  latest release breaching 10 events.

Route warnings to Slack (`#alerts`) and critical to the on-call pager.

### Job failures

The daily subscription-renewal cron (`subscription-billing.service.ts`,
02:00) is the one background job that moves money, and its errors are swallowed
so one bad subscription never aborts the sweep. Two signals feed Sentry:

- A **total job failure** (lock/DB unreachable, unexpected throw) is captured
  via `Sentry.captureException(error, { tags: { job: 'subscription-renewal' } })`.
- A **partial failure** (`summary.errors > 0`) is captured as a `warning`
  message with the errored/due counts.

Alert rules:

- **Critical** — any event tagged `job:subscription-renewal` (a total failure);
  the sweep did not complete. Page on-call.
- **Warning** — a billing-completed-with-errors message; charges were missed and
  will retry next pass. Slack `#alerts`.

Because the job runs once daily, also add a Sentry Cron monitor for
`subscription-renewal` (schedule `0 2 * * *`) so a **missed** run — the job that
never fired at all — alerts too.

## Local development

None of the above is active locally: without `SENTRY_DSN` the SDKs no-op, and
the deploy pipeline never runs. To exercise error reporting locally, set
`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` in the relevant `.env.local` and throw
from a route.
