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
├── storage/                # Cloudflare R2 signed-upload service — POST /uploads
└── health/                 # GET /health — pings Postgres + Redis
```

## Endpoints

| Method | Path       | Description                                                        |
| ------ | ---------- | ------------------------------------------------------------------ |
| `GET`  | `/health`  | `{ db, redis }` status. 200 when both up, 503 when either is down. |
| `POST` | `/uploads` | Mint a presigned R2 upload URL. 503 when R2 is not configured.     |

```bash
curl http://localhost:3000/health
# {"db":"ok","redis":"ok"}
```

## File uploads (Cloudflare R2)

`POST /uploads` returns a short-lived presigned `PUT` URL so clients upload
straight to [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible)
without the bytes passing through the API. The service derives a
collision-resistant object key (`<prefix>/<uuid><ext>`) and never exposes bucket
credentials.

```bash
curl -X POST http://localhost:3000/uploads \
  -H 'content-type: application/json' \
  -d '{"contentType":"image/png","fileName":"avatar.png","prefix":"avatars"}'
# { "key": "avatars/<uuid>.png", "url": "https://…", "method": "PUT",
#   "contentType": "image/png", "expiresIn": 900, "publicUrl": "https://…" }

# Then upload the bytes directly to R2:
curl -X PUT --upload-file avatar.png -H 'content-type: image/png' "<url>"
```

Configure R2 via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET` (all required), plus optional `R2_PUBLIC_URL` and `R2_SIGNED_URL_TTL`
(see `.env.example`). When any credential is missing the endpoint returns 503,
so the API still boots in CI / local dev without R2.

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
