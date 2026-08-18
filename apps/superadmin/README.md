# @fit/superadmin

Platform operator console — **SUPER_ADMIN-only**. Served at `superadmin.<root>`
(e.g. `superadmin.formacore.io`) and used by us, the platform operators, to
manage every gym on the system. SUPER_ADMIN bypasses tenant scoping
(`@AllowCrossTenant` on the API side).

[Next.js 15](https://nextjs.org/) (App Router), TypeScript, and the FormaCore
design system — [`@fit/ui-kit`](../../packages/ui-kit) over Astryx, authored in
StyleX. **No Tailwind.** The staff console and member portal still carry a
Tailwind config that mirrors `formacoreTheme.ts` by hand, purely because screens
written before the kit existed still author `className=`; this app has no such
history and should not acquire one.

> Distinct from `apps/admin`, the tenant-scoped **gym** staff console. This is
> the **platform** console: one operator, every gym.

## Auth

The whole app is SUPER_ADMIN-gated in `middleware.ts`, which verifies the
`opsAccessToken` cookie with the same HS256 check the API uses (Web Crypto,
Edge-safe) and answers in two ways: no session → the console's own `/login`; a
valid session that is not a platform operator → `/403`. With `JWT_SECRET` unset
the gate fails closed. Server Components re-resolve the session with
`getServerSession()` (`lib/session.ts`).

### Why `ops*` cookies, host-only

The tenant surfaces set `accessToken` / `refreshToken` on the **parent** domain
(`COOKIE_DOMAIN=.formacore.io`) so one sign-in covers `<slug>.formacore.io` and
its `/admin`. This console sits inside that same parent. Writing those names here
would overwrite the operator's own tenant sessions — and once one-click
impersonation lands, an impersonated gym session would overwrite the SUPER_ADMIN
session that launched it.

So the operator session uses **different names** (`opsAccessToken`,
`opsRefreshToken`) written **host-only** (no `domain` attribute). The two
identities stay independent: an operator can hold a console session and a gym
session in separate tabs, and signing out of either leaves the other alone. This
is also why the console needs a sign-in of its own — no other surface can mint a
session for this host.

## Layout

```
app/
├── layout.tsx           # root layout — fonts, FormaCore theme (dark, fixed)
├── globals.css          # Astryx reset + FormaCore tokens; nothing else
├── (console)/
│   ├── layout.tsx       # signed-in shell — rail + content
│   ├── page.tsx         # the gym roster (home) — server-rendered
│   ├── gyms-table.tsx   # the roster table + suspend / reactivate
│   └── actions.ts       # Server Actions (status update)
├── login/               # the console's own credentials sign-in
├── 403/page.tsx         # authenticated, but not a platform operator
├── api/session/route.ts # set / read / clear the ops session cookies
├── error.tsx            # route-segment error boundary
└── global-error.tsx     # root boundary — styled inline, no design system
components/
└── sign-out-button.tsx
lib/
├── auth-session.ts      # isomorphic session core (verify JWT, SUPER_ADMIN gate)
├── session.ts           # getServerSession() for RSC / actions
├── session-refresh.ts   # edge-side silent refresh + cookie descriptors
├── api.ts               # server-side @fit/api client (/admin/gyms)
├── tenant-url.ts        # <slug>.<root> portal + console URLs
└── env.ts               # validated environment
middleware.ts            # the access gate
```

## Gyms roster

`/` server-renders `GET /admin/gyms` (cross-tenant, SUPER_ADMIN-only) into one
row per tenant: name + owner email, subdomain (linked to both that gym's portal
and its staff console), status, member count, and provisioning date.

**Suspend / reactivate** → `PATCH /admin/gyms/:id/status`, through a Server
Action that re-asserts SUPER_ADMIN and forwards the operator's bearer token. A
suspended gym's staff and members cannot start a NEW session (login + refresh are
gated API-side); sessions already open expire on their own. Suspending asks for
confirmation, reactivating does not — undoing a lockout should be one press.

The table is unpaged and unsorted on purpose: the platform has tens of gyms, and
paging controls over 20 rows are furniture. `DataTable` already carries the sort
and pager wiring for when that changes.

## One-click impersonation

**Enter admin** opens the gym's own staff console, already signed in as its
owner, in a new tab. No second UI: it is `@fit/admin`, exactly as the owner sees
it, with a banner across the top.

The handoff is a **single-use code**, not a token:

```
superadmin  POST /admin/gyms/:id/impersonate     → { handoffCode, expiresInSeconds: 60 }
            (API stores {gymId, ownerId, actorId} in Redis, audits gym.impersonate)
browser     → https://<slug>.<root>/admin/impersonation/start?code=…
admin       POST /auth/impersonation/exchange    → { accessToken, gym, ownerEmail }
            (API consumes the code — delete-wins — mints the token, audits gym.impersonate.start)
admin       sets `impersonationToken` (host-only, httpOnly) → redirects into the console
```

Why a code. The token has to cross an origin, and the ways to carry a token
across one put a live session into browser history, the `Referer` header, and
every log in between. A code is worth nothing after the single redemption that
turns it into a cookie the browser never sees.

What keeps it contained:

- **10-minute token, no refresh token.** An impersonation is meant to run out;
  nothing renews it. The banner counts it down.
- **`impersonationToken`, host-only.** It cannot overwrite the operator's own
  session or any other tenant's, and Exit is one cookie deletion that puts back
  whatever was underneath.
- **Audited at both ends** — `gym.impersonate` when the code is issued (so an
  unredeemed request is still on the record) and `gym.impersonate.start` when a
  session is actually minted. Both name the operator as actor and the owner as
  target.
- **A dead impersonation is never swapped for another identity.** If the token
  stops verifying, `@fit/admin`'s middleware sends the operator to
  `/impersonation/exit` rather than falling through to whatever session sits
  beside it.
- A gym with **no owner** has nobody to act as; the button is disabled rather
  than minting a code the API would refuse (`422 GYM_HAS_NO_OWNER`).

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Dev server on http://localhost:3004       |
| `pnpm build`      | Production build (`next build`)           |
| `pnpm start`      | Serve the production build on port 3004   |
| `pnpm lint`       | ESLint (shared `@fit/config` flat config) |
| `pnpm type-check` | `tsc --noEmit`                            |

Run from the repo root via Turborepo:

```bash
pnpm turbo run dev --filter=@fit/superadmin
```

Locally, sign in as the seeded platform admin: `superadmin@fit.local` /
`Test1234!` (`pnpm db:seed`, non-production only).

## Vercel

- **Root Directory**: `apps/superadmin`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@fit/superadmin`
  (also pinned in `vercel.json`)
- **Domains**: `superadmin.<root>` — never the apex or a tenant subdomain.
  `superadmin` is in `RESERVED_SUBDOMAINS`, so no gym can ever claim it.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
