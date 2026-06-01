# @fit/api

Backend API service — [NestJS](https://nestjs.com/) (Express platform) with a
health endpoint, [Sentry](https://sentry.io/) error reporting, and structured
[pino](https://getpino.io/) logging.

## Layout

```
src/
├── main.ts                 # bootstrap: Sentry init, CORS, pino logger
├── instrument.ts           # Sentry.init() — imported first, before anything else
├── app.module.ts           # root module (Sentry + logging + Redis + Health)
├── common/
│   └── logging.ts          # nestjs-pino config (requestId / traceId / userId)
├── redis/                  # shared ioredis client
└── health/                 # GET /health — pings Postgres + Redis
```

## Endpoints

| Method | Path      | Description                                                        |
| ------ | --------- | ------------------------------------------------------------------ |
| `GET`  | `/health` | `{ db, redis }` status. 200 when both up, 503 when either is down. |

```bash
curl http://localhost:3000/health
# {"db":"ok","redis":"ok"}
```

## Logging

Every request gets a `requestId` (honouring an inbound `x-request-id` header,
otherwise a fresh UUID, and echoed back on the response). Each log line also
carries `traceId` (from the active Sentry span) and `userId` (once the auth
layer populates `req.user`).

## Sentry

`instrument.ts` calls `Sentry.init()` from `@sentry/nestjs` before the app
boots; `SentryGlobalFilter` forwards unhandled exceptions. Both are no-ops
unless `SENTRY_DSN` is set, so nothing ships to Sentry in local dev / CI.

## Configuration

Copy `.env.example` → `.env.local` and fill in the values. Shared infra vars
(`DATABASE_URL`, `REDIS_URL`) are documented at the repo root.

## Scripts

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `pnpm dev`        | Watch-mode dev server (`tsx watch`) |
| `pnpm build`      | Compile to `dist/` (`tsc`)          |
| `pnpm start`      | Run the server (`tsx src/main.ts`)  |
| `pnpm test`       | Run unit tests (Vitest)             |
| `pnpm lint`       | ESLint                              |
| `pnpm type-check` | `tsc --noEmit`                      |
