# @fit/e2e

End-to-end tests (Playwright) for the staff **admin** console (`@fit/admin`) and
the member **web** portal (`@fit/web`), each backed by the real **API**
(`@fit/api`), Postgres, and Redis. The two suites are **separate configs** so each
boots only the apps it drives:

- `playwright.config.ts` — the admin console (default `test:e2e`).
- `playwright.web.config.ts` — the member portal (`test:e2e:web`).
- `playwright.new-gym.config.ts` — a new gym's first day, console and site together
  (`test:e2e:new-gym`). `test:e2e:web` runs it straight after the member portal
  suite, so CI's member E2E job covers both.

## What it covers

`tests/admin-core-flows.spec.ts` drives one interdependent journey against the
redesigned admin screens (T9.3):

**Login → member CRUD → schedule a class → check-in → POS sale → refund.**

The steps run serially and reuse what they create — the member created early is
later checked in, and the product sold at the POS is the order later refunded.

`tests/member-booking-checkout.spec.ts` drives the member journey (T9.4) against
the portal on the `downtown` tenant subdomain:

**Register → verify → sign in → book a class (capacity) → join a full class's
waitlist → shop → cart → checkout.**

A few preconditions the portal has no UI for — the emailed verification link, gym
enrolment, an entitling subscription, and a retail catalogue (the seed ships no
products and its demo classes are past-dated) — are seeded directly through Prisma
in `fixtures.ts`; everything the portal owns is exercised through the browser. The
portal is tenant-scoped by subdomain, so the suite drives it on
`http://downtown.localhost:3001` (with `NEXT_PUBLIC_ROOT_DOMAIN=localhost`) and
runs the web server in **dev** mode, whose non-`secure` session cookies survive
plain HTTP.

`tests/member-tenant-isolation.spec.ts` pins down that a session belongs to the gym
host it was minted on (see `docs/subdomain-routing.md`), across the seeded
`downtown` and `riverside` tenants on the same dev server:

- host-only session cookies — a `downtown` sign-in never reaches `riverside`, and a
  `downtown` token planted there is refused, redirected to sign-in, and cleared;
- reserved labels (`app`, `www`) render the generic portal, an unknown label renders
  "gym not found";
- a silent refresh keeps a `riverside` session on `riverside`, not the member's
  primary gym;
- the API contract over HTTP — `x-tenant-host` / `Forwarded` select a public route's
  tenant, and another gym's host on an authenticated call is `403 TENANT_MISMATCH`.

Its account belongs to both gyms (`provisionMultiGymMember` in `fixtures.ts`), with
`downtown` joined first so it is the primary gym the refresh must not drift to.

`tests/new-gym-flow.spec.ts` follows a gym that did not exist when the suite
started, on its own `<slug>.localhost` host:

**Operator provisions (`POST /admin/gyms`) → owner opens the mailed activation link →
sets a password → signs in to the console → member signs up → opens the mailed
verification link → signs in to the portal → nothing of either reaches `downtown`.**

It boots all three apps in their production shape: the console under `/admin`, reached
through the member site's `ADMIN_ORIGIN` proxy. There is no mailbox — with
`RESEND_API_KEY` unset the API logs every mail's link instead of sending it, so the
config writes the API's output to `.logs/api.log` and `mail-log.ts` reads each link
back from there. That tests the link the API really built (the gym's host included)
without adding a test-only route to the API. For the same reason its API server is
never reused: a server started elsewhere logs somewhere else.

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

pnpm --filter @fit/e2e test:e2e        # admin suite, headless
pnpm --filter @fit/e2e test:e2e:web    # member portal suite, then the new-gym flow
pnpm --filter @fit/e2e test:e2e:new-gym  # new gym only: console + site, headless
pnpm --filter @fit/e2e test:e2e:ui     # interactive UI mode (admin config)
```

Each config's `webServer` boots the apps it needs automatically, reusing them if
they are already running:

- **admin** — the API (port 3000) and the admin app (port 3002, served at the root
  via `ADMIN_BASE_PATH=''`). Point it elsewhere with `E2E_API_URL` / `E2E_ADMIN_URL`.
- **member** — the API (port 3000) and the web app (port 3001, in dev mode). The
  browser drives it at `http://downtown.localhost:3001`; override with `E2E_API_URL`
  / `E2E_WEB_HOST`. The member suite writes fixtures straight to the DB, so it needs
  `DATABASE_URL` in its own environment (defaults to the local `fit` database). The
  tenant-isolation spec builds its other hosts (`riverside.localhost`,
  `app.localhost`, …) on `E2E_WEB_PORT` (default `3001`).

"Already running" means **anything** that answers the probe URL below `400`: a Next
dev server left on port 3000 answers `/health` with a `307` and is silently taken
for the API. `E2E_API_URL` only moves the probe and the URL the apps call — the
boot command still binds port 3000 — so to use another port, start the API there
yourself first (`NODE_ENV=test`, the same `JWT_SECRET`, `PLATFORM_ROOT_DOMAIN=localhost`,
`RATE_LIMIT_ENABLED=false`) and let the config reuse it.

The default `test` script is a no-op so the infra-heavy suites stay out of the
standard `pnpm test` pipeline; CI runs each as a dedicated job.

## Notes

- `@playwright/test` is pinned to the version whose bundled Chromium matches the
  browser preinstalled in CI/dev — bump both together.
- Selectors lean on stable form `id`s / input `name`s, ARIA roles/labels, and
  English button text (the admin app via a `NEXT_LOCALE=en` cookie, the member
  portal via the `/en` path); neither app ships `data-testid`s.
