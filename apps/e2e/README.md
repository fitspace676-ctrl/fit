# @fit/e2e

End-to-end tests (Playwright) for the staff **admin** console (`@fit/admin`)
backed by the real **API** (`@fit/api`), Postgres, and Redis.

## What it covers

`tests/admin-core-flows.spec.ts` drives one interdependent journey against the
redesigned screens (T9.3):

**Login → member CRUD → schedule a class → check-in → POS sale → refund.**

The steps run serially and reuse what they create — the member created early is
later checked in, and the product sold at the POS is the order later refunded.

## How auth works

The admin console has no sign-in page of its own; it trusts an `accessToken`
cookie (an HS256 JWT the API mints, verified by the admin middleware against the
shared `JWT_SECRET`). `global-setup.ts` reproduces that once: it logs the seeded
OWNER in via `POST /auth/login` and writes that cookie (plus `NEXT_LOCALE=en`)
into the Playwright storage state, so every test starts already authenticated.

## Running locally

Requires Postgres + Redis (see the repo `docker-compose.yml`), a migrated and
seeded database, and the pinned Chromium build.

```bash
# from the repo root
docker compose up -d          # Postgres + Redis
pnpm db:migrate && pnpm db:seed
pnpm --filter @fit/e2e exec playwright install chromium

pnpm --filter @fit/e2e test:e2e        # headless
pnpm --filter @fit/e2e test:e2e:ui     # interactive UI mode
```

Playwright's `webServer` boots the API (port 3000) and the admin app (port 3002,
served at the root via `ADMIN_BASE_PATH=''`) automatically, reusing them if they
are already running. Point the suite elsewhere with `E2E_API_URL` /
`E2E_ADMIN_URL`. The default `test` script is a no-op so the infra-heavy suite
stays out of the standard `pnpm test` pipeline; CI runs it as a dedicated job.

## Notes

- `@playwright/test` is pinned to the version whose bundled Chromium matches the
  browser preinstalled in CI/dev — bump both together.
- Selectors lean on stable form `id`s, ARIA roles/labels, and English button
  text (the `NEXT_LOCALE=en` cookie); the admin app ships no `data-testid`s.
