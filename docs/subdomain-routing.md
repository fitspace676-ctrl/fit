# Subdomain routing & multi-tenancy

Each gym (tenant) is served at `<slug>.<rootDomain>`:

| Surface                  | Host                  | App               |
| ------------------------ | --------------------- | ----------------- |
| Member site              | `<slug>.<root>`       | `@fit/web`        |
| Staff console            | `<slug>.<root>/admin` | `@fit/admin`      |
| Marketing / owner signup | `<root>` (apex)       | `@fit/platform`   |
| Operator console         | `superadmin.<root>`   | `@fit/superadmin` |

`superadmin` is in `RESERVED_SUBDOMAINS` (`packages/types/src/gyms.ts`), so no gym
can ever claim that label and `SubdomainTenantMiddleware` never resolves it to a
tenant — the operator console gets a host inside the tenant namespace without
being mistaken for one. Its session cookies are named `ops*` so they never
collide with a tenant session of the same operator.

### Three cookie scopes, on purpose

| Cookie                                     | Scope                          | Set by                       |
| ------------------------------------------ | ------------------------------ | ---------------------------- |
| `accessToken` / `refreshToken`             | host-only, one `<slug>.<root>` | web + admin sign-in          |
| `opsAccessToken` / `opsRefreshToken`       | host-only, `superadmin.<root>` | the operator console         |
| `impersonationToken` / `impersonationMeta` | host-only, one `<slug>.<root>` | `/admin/impersonation/start` |

All three are host-only. A gym's portal and its console still share one tenant
session, because the console is served on the **same host** under `/admin` — not
because the cookie spans subdomains (it used to; see
[Session isolation](#session-isolation)). An operator holding a SUPER_ADMIN
session and acting as one gym's owner in another tab are three identities that
must not overwrite each other. `pickSessionToken` (`apps/admin/lib/auth-session.ts`)
is the one place the precedence lives — impersonation wins where it exists.

The active gym is derived from the request **host**, not hard-coded. Everything is
domain-agnostic via env, so connecting a real domain (or switching to a wildcard on
a Vercel Pro upgrade) needs **no code change** — only the env + DNS + Vercel domain
entries below.

## How it works (code)

- **API** — `SubdomainTenantMiddleware` (`apps/api/src/common/middleware/subdomain-tenant.middleware.ts`) recovers the slug from the tenant host (see [Tenant host resolution](#tenant-host-resolution)) via `extractTenantSlug(host, PLATFORM_ROOT_DOMAIN)` and scopes **public/unauthenticated** requests to that gym. Authenticated requests are scoped by their JWT (`gymId` claim) — the session always wins over the host, and a session used on another gym's host is refused (`403 TENANT_MISMATCH`).
- **Login binding** — a credentials sign-in on `<slug>.<root>` forwards the slug (`loginSchema.gymSlug`); `AuthService.resolveSessionScope(userId, gymSlug)` binds the issued token to that gym when the user has a membership there, else falls back to their earliest-joined (primary) gym. The token carries both `gymId` and `gymSlug`.
- **Frontend** — `extractGymSlug(host, rootDomain)` (`@fit/utils`) is the shared helper; `extractGymSlugEdge` / `isTenantMismatch` (`@fit/utils/tenant-host-edge`) are the import-free copies the Edge middlewares use. `getActiveGymSlug()` (`apps/web/lib/active-gym.ts`, `apps/admin/lib/active-gym.ts`) reads the slug in Server Components from `next/headers`. `apps/web/lib/auth.ts` reads `window.location.host` at sign-in to set `gymSlug`.
- **Tenant header** — every call web/admin make to the API, server-side or from the browser, carries `x-tenant-host` (`lib/tenant-host.ts` / `lib/tenant-headers.ts` in each app).

## Tenant host resolution

The API does not trust `Host` alone, because in production it never sees the
gym's host there:

- **Server-side calls** from web/admin reach the API at its own Railway host, so
  `Host` is `api-production-….up.railway.app`.
- **Railway's edge overwrites `x-forwarded-host`** with that same Railway host on
  the way in. A `downtown.formacore.io` forwarded by a proxy arrives as the API's
  own host, and the tenant is lost — this is what produced
  `500 No tenant in scope` on the guest cart before the change.
- The edge **does** preserve the client's host in the RFC 7239 `Forwarded`
  header (`Forwarded: for=…;host=downtown.formacore.io;proto=https`).

So `resolveTenantHost` reads, in order, and takes the **first candidate that names
a tenant** under `PLATFORM_ROOT_DOMAIN`:

1. `x-tenant-host` — stamped by web/admin with the public host the visitor is on
   (`x-forwarded-host ?? host` of the incoming request; `window.location.host` in
   the browser).
2. `host=` of the **first** element of `Forwarded` (quotes and port stripped).
3. `x-forwarded-host` (first entry).
4. `Host`.

A candidate that names no tenant — the bare root, a reserved label like `app`, a
multi-level or foreign host — is skipped rather than ending the search, so a
platform-host `x-tenant-host` cannot mask a real one further down. `POST
/auth/refresh` reads the slug the same way.

**Spoofing.** The header is a _selector_, not a credential. On a public route it
only picks whose public data is served — data anyone can already read on that
gym's site. An authenticated request's scope always comes from its JWT; the host
is only compared against it.

## Session isolation

Before this, the session cookies were written on the parent domain
(`COOKIE_DOMAIN=.formacore.io`), so a sign-in on `riverside.formacore.io` was sent
to `downtown.formacore.io` too — one gym's chrome rendered over another gym's
session. Four layers now keep a session on its own gym:

1. **Host-only cookies.** web and admin write `accessToken` / `refreshToken` with
   no `Domain` attribute (`apps/web/lib/session-cookies.ts`,
   `apps/admin/lib/session-cookies.ts`). Nothing needed the sharing: the console
   is on the same host under `/admin`, the platform signup issues no session, and
   the operator console and impersonation have their own cookies.
2. **`gymSlug` claim.** Access tokens carry the slug of the gym they were issued
   for, beside `gymId` (absent on SUPER_ADMIN/platform sessions).
3. **`403 TENANT_MISMATCH` at the API.** `assertSessionMatchesTenantHost`
   (`apps/api/src/common/tenant/assert-tenant-host.ts`), run by `TenantMiddleware`
   and the cart's `CartIdentityMiddleware`, refuses a token whose `gymSlug`
   differs from the resolved host slug with `403 { code: "TENANT_MISMATCH" }`.
   It only fires when **both** sides exist: no tenant host (the Railway host,
   `app.<root>`, `localhost`, a mobile client) or no `gymSlug` (SUPER_ADMIN, a
   token issued before the claim) is "nothing to compare", never a mismatch.
   Impersonation tokens carry the impersonated gym's slug and pass on its host.
4. **The Next middlewares.** Both compare the verified token's `gymSlug` with the
   request host's slug:
   - **web** (`apps/web/middleware.ts`) treats another gym's token as no session:
     its cookies are cleared on the response, a protected page redirects to this
     host's `/<locale>/member/login`, a public page renders signed-out. The
     refresh cookie is not spent on a foreign session.
   - **admin** (`apps/admin/middleware.ts`) clears the session (or only the
     impersonation cookies, when that is what carried it) and redirects to
     `<ADMIN_BASE_PATH>/login?from=…`. When a Server Component meets the API's
     `403 TENANT_MISMATCH` instead, `lib/api.ts` redirects to
     `/login?reason=tenant`, and the sign-in page clears the cookies itself. The
     sign-in pages clear but never redirect, so a cookie the browser refuses to
     drop cannot loop.

**Refresh stays on its gym.** `RefreshToken.gymId` (migration
`20260913180000_refresh_token_gym`) records the gym a session was issued for, and
rotation keeps it. `AuthService.refresh` re-scopes a pinned token to that gym
only — never to the member's primary gym:

- membership in the pinned gym gone or no longer ACTIVE → `401 REFRESH_TOKEN_INVALID`
  (sign in again);
- the pinned gym suspended → `403 GYM_SUSPENDED`;
- an unpinned row (issued before the pin, or a platform session) → the slug of
  the refresh request's tenant host, else the primary gym as before.

**Legacy parent-domain cookies are purged.** Browsers still hold
`Domain=.formacore.io` session cookies from before the change. While
`COOKIE_DOMAIN` / `NEXT_PUBLIC_COOKIE_DOMAIN` is set, every clear **and** every
fresh write also expires the `Domain=` copy (raw `Set-Cookie` headers, because
`res.cookies.set` keys cookies by name and cannot hold both). The env var is no
longer used to _set_ anything.

## Unknown slug → "gym not found"

A host that names a tenant nobody owns (`typo.formacore.io`, a deleted gym) is
not rendered as a sign-in form for a gym nobody can join. `getActiveGymPresence()`
(`apps/web/lib/active-gym.ts`) asks `GET /gyms/by-subdomain/:slug`:

| Presence    | When                                                    | Renders                     |
| ----------- | ------------------------------------------------------- | --------------------------- |
| `none`      | no tenant in the host (apex, `app`, `www`, preview URL) | the generic portal          |
| `found`     | the slug names an active gym                            | the gym's portal            |
| `not-found` | the lookup answered `404`                               | `GymNotFound` on every page |
| `unknown`   | network error / `5xx`                                   | the portal, as `found`      |

`GymNotFound` is rendered by the locale layout in place of the page, so every route
on such a host says the same thing. Because it is a layout render rather than
Next's `notFound()`, the document's HTTP status is not a `404`. A `404` lookup is
not kept in Next's fetch cache, so a gym created a moment later is found on the
next visit.

### At the API: `TENANT_REQUIRED`

A public or optional-auth route that needs a gym — the guest cart is the one that
showed it — can be called on a host that names none: `app.<root>`, the API's own
Railway host with no `x-tenant-host`, a slug nobody owns. `SubdomainTenantMiddleware`
lets such a request through with no tenant, and the handler's `TenantContext.gymId`
read refuses it with a client error instead of the `500 INTERNAL_ERROR` it used to be:

| Situation                                         | Answer                            |
| ------------------------------------------------- | --------------------------------- |
| no tenant store (public route, host names no gym) | `404 { code: "TENANT_REQUIRED" }` |
| a session or cross-tenant request with no gym     | `403 { code: "TENANT_REQUIRED" }` |

The `403` is what `TenantGuard` already answered on guarded routes; the code is
`TENANT_REQUIRED_CODE` in `packages/types/src/auth.ts`.

It sits beside `TENANT_MISMATCH` and answers a different question: `TENANT_MISMATCH`
is a session on **another** gym's host (both sides known, and they differ);
`TENANT_REQUIRED` is a request with **no** gym at all. Neither is a `500`, and
neither falls back to some default gym.

## Branding per gym

A gym's member site and console name themselves after the gym, not the product.
Both root layouts (`apps/web/app/[locale]/layout.tsx`, `apps/admin/app/layout.tsx`)
build `generateMetadata` / `generateViewport` per request from the public
`GET /gyms/by-subdomain/:slug` lookup they already make (`getActiveGymBrand` in each
app's `lib/active-gym.ts`), through `gymMetadata` / `gymViewport` in
`apps/{web,admin}/lib/gym-metadata.ts`:

| Field             | Member site (`<slug>.<root>`)                       | Console (`<slug>.<root>/admin`)                                     |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| title             | `Downtown Strength`, pages `%s · Downtown Strength` | `Downtown Strength — Staff console`, pages `%s · Downtown Strength` |
| icon / Open Graph | the gym's logo, else `public/icon.png`              | the gym's logo, else `adminPath('/icon.png')`                       |
| `theme-color`     | the gym's colour, else none                         | the gym's colour, else none                                         |

With no gym in scope — apex, `app.<root>`, a preview URL, an unknown slug, or a failed
lookup — both read plain **FormaCore**. Page titles carry only their own name; the
template adds the gym's. The icon lives in `public/`, not `app/icon.png`, because Next
would emit a file-based icon ahead of the gym's logo; the console prefixes it with
`adminPath`, since Next does not apply `basePath` to a metadata URL.

## Env

Set the same root domain on the API and all three Next apps:

```
# API (apps/api) — also the base of every tenant link the API mails.
# Defaults to "localhost", so an unset production deployment builds visibly
# broken `<slug>.localhost` links rather than leaking tokens to a real domain.
PLATFORM_ROOT_DOMAIN="fit.ge"

# web / admin / platform
NEXT_PUBLIC_ROOT_DOMAIN="fit.ge"
```

`COOKIE_DOMAIN` / `NEXT_PUBLIC_COOKIE_DOMAIN` are **not** needed for a new
deployment. They only exist to purge legacy parent-domain cookies (see
[Session isolation](#session-isolation)); a deployment that never wrote those
leaves them unset.

## Local development

`*.localhost` resolves to `127.0.0.1` automatically in Chrome/Edge — **no hosts-file
edit needed**. Set:

```
PLATFORM_ROOT_DOMAIN="localhost"
NEXT_PUBLIC_ROOT_DOMAIN="localhost"
```

Then `pnpm dev` and visit:

- `http://downtown.localhost:3001` — member site for the `downtown` gym
- `http://downtown.localhost:3002/admin` — staff console for `downtown`
- `http://localhost:3003` — platform marketing (apex)

Seed two tenants first: `pnpm db:seed` (or `fit db seed`) creates `downtown` + `riverside`.
Sign in as `alex@example.com` on `downtown.localhost:3001` → the session binds to the
`downtown` gym (OWNER); on `riverside.localhost:3001` it binds to `riverside` (TRAINER).
The two are separate sessions — signing in on one host does not sign you in on the
other.

**Seeding is local-only.** `seed.ts` and `seed-mobile-smoke.ts` write well-known
fixture accounts (`alex@example.com`, `sam@example.com`, `superadmin@fit.local`, all
on the shared dev password), so both call `exitIfUnsafeSeedTarget`
(`packages/db/prisma/seed-guard.ts`) before any query. It exits non-zero when
`NODE_ENV=production` or `DATABASE_URL` names a non-local host — anything dotted, such
as `*.railway.internal` or `*.proxy.rlwy.net`; `localhost`, a bare compose service
name and a Unix socket pass, so CI's seeds are unaffected. `ALLOW_SEED_PRODUCTION=1`
overrides it, loudly. None of the fixture accounts should ever exist in production: on
a real tenant host they would be a known password into a real gym.

> Firefox/Safari don't auto-resolve `*.localhost`; add `127.0.0.1 downtown.localhost`
> to `/etc/hosts` per slug, or test in Chrome.

The isolation guarantees above are pinned end-to-end by
`apps/e2e/tests/member-tenant-isolation.spec.ts` (`pnpm --filter @fit/e2e test:e2e:web`).

## Deployment — Cloudflare DNS + Vercel domains

DNS is managed in **Cloudflare**; the apps run on **Vercel** (projects `fit-web`,
`fit-admin`, `fit-platform`). Two modes:

### A. Now — fixed test subdomains (works on Vercel Hobby)

The Hobby plan has **no wildcard domains**, but you can add specific subdomains. For
each test gym `<slug>`:

1. **Vercel** — add the domain to the project:
   ```
   vercel domains add <slug>.<root> fit-web      # member site
   vercel domains add <slug>.<root> fit-admin    # (optional) if admin gets its own host
   ```
   (Or Project → Settings → Domains in the dashboard.) Add the apex `<root>` to `fit-platform`.
2. **Cloudflare** — add a DNS record pointing at Vercel:
   - Type `CNAME`, Name `<slug>`, Target `cname.vercel-dns.com`, Proxy **DNS only** (grey cloud — Vercel terminates TLS).
   - Apex `<root>`: `CNAME` (or flattened `A`) → `cname.vercel-dns.com` for `fit-platform`.
3. Verify: `https://<slug>.<root>/en` serves the member site; sign-in scopes to `<slug>`.

Repeat steps 1–2 per gym. Tedious but fine for a handful of test tenants.

### B. After a Vercel Pro upgrade — wildcard (no per-gym steps)

1. **Vercel** — add the wildcard to `fit-web` (and `fit-admin` if separate):
   ```
   vercel domains add "*.<root>" fit-web
   ```
2. **Cloudflare** — `CNAME`, Name `*`, Target `cname.vercel-dns.com`, **DNS only**.
3. Done — every `<slug>.<root>` resolves automatically; no code or per-gym change.
   New gyms work the moment they're provisioned.

No application code differs between A and B — only the domain/DNS entries.

## Admin console routing (`<slug>.<root>/admin`)

The member site (`fit-web`) and staff console (`fit-admin`) are **separate Vercel
projects**, but the console is served under the member subdomain's `/admin` path.
This is wired with a path proxy + a base path, both **on by default** — the code
defaults are `ADMIN_BASE_PATH=/admin` (`apps/admin/next.config.mjs`) and an
`ADMIN_ORIGIN` fallback pointing at `fit-admin`'s `*.vercel.app` origin
(`apps/web/next.config.mjs`); setting the env vars only overrides those:

1. **Admin deployment** — set `ADMIN_BASE_PATH=/admin` on `fit-admin`, so it serves
   all routes and `_next` assets under `/admin`. Give it a stable origin to proxy to
   — either its `*.vercel.app` URL or a dedicated host (e.g. `admin-origin.<root>` →
   `fit-admin`, a normal Vercel domain; it is not a tenant slug).
2. **Member site** — set `ADMIN_ORIGIN=https://<that origin>` on `fit-web`. The web
   app then proxies `/admin/*` → `${ADMIN_ORIGIN}/admin/*` (`apps/web/next.config.mjs`)
   and skips its own middleware on `/admin` (matcher exclusion), so the console isn't
   locale-prefixed or auth-gated by the member site.
3. The console is on the **same host** as the member site, so the host-only session
   cookie a sign-in on `<slug>.<root>` writes is already visible to
   `<slug>.<root>/admin`. The console reads the gym's host from `x-forwarded-host`,
   which the rewrite sets.

With both env vars unset the defaults above still give you the proxied layout, so
`fit-admin` answers under `/admin` on its own `*.vercel.app` host too. To serve the
console at the root instead, set `ADMIN_BASE_PATH` to the **empty string** on it (what
`apps/e2e` does) — and the same on the API, which appends the prefix to `ADMIN_URL`
when it builds console links. This needs a live deploy to verify end-to-end
(cross-project proxy + cookies).

> Single-host alternative (simplest for a first test): point one host
> (`manage.<root>` → `fit-admin`, **no** base path / proxy) and let the console read
> the gym from its session cookie. Works for single-gym owners; drop it once the
> `/admin` proxy is verified. A session signed in there is that host's alone.

## A new gym's flow (operator → owner → member)

What happens between "the operator creates a gym" and "its first member signs in",
and which host each step is on:

1. **Provision** — the operator console's form (`apps/superadmin/components/new-gym-form.tsx`)
   calls `POST /admin/gyms`, which is `AuthService.registerGym`: gym + owner account +
   `OWNER` membership, no password and no session. The owner is mailed
   `buildOwnerOnboardingUrl` → `https://<slug>.<root>/admin/activate?token=…`.
2. **Activate** — that page (`apps/admin/app/activate`) posts `POST /auth/activate` with
   the page's host as `x-tenant-host`; a link opened on another gym's console is
   `403 TENANT_MISMATCH` before the token is spent. It verifies the address and sets
   the password, then sends the owner to `/admin/login?email=…&activated=1`.
3. **Sign in** — the console sign-in takes the gym from the subdomain, so the session's
   `gymSlug` is this gym's and its host-only cookies live on `<slug>.<root>` alone.
4. **Member signup** — the join wizard on `<slug>.<root>` calls `POST /auth/signup`
   (account + `MEMBER` membership); the verification mail is `buildVerificationUrl` →
   `https://<slug>.<root>/member/verify?token=…`, unless `EMAIL_VERIFICATION_URL`
   overrides it. After verifying, the member signs in on the same host.

`apps/e2e/tests/new-gym-flow.spec.ts` (`pnpm --filter @fit/e2e test:e2e:new-gym`; in CI
it runs after the member suite in **E2E · member booking + checkout**) drives exactly this on `<slug>.localhost`, reading the mailed links
out of the API's log, and then checks the new gym against `downtown`: the owner's
session is refused on downtown's console and by the API on downtown's host, and
neither roster shows the other gym's people.

## Owner activation

A provisioned owner has an account and an `OWNER` membership but no password, so the
welcome mail's link has to end in a credential, not just a verified address:

1. **Provision** — `POST /admin/gyms` (operator console) and `POST /auth/register-gym`
   (marketing signup) both go through `AuthService.registerGym(…, subdomainSlug)`. It
   stores a verification token in Redis for `EMAIL_VERIFICATION_TTL` (default 24h) and
   mails `buildOwnerOnboardingUrl(token, slug)` (`apps/api/src/auth/email.service.ts`).
2. **Link** — `OWNER_ONBOARDING_URL` if set, else `buildConsoleUrl('activate', slug)` →
   `https://<slug>.<root>/admin/activate?token=…`, else the `ADMIN_URL` console, else
   `localhost:3002`. The override is optional and unset on Railway; unlike the member
   links below it wins over the slug, so setting it sends every gym's owner to one host.
3. **Activate** — `/activate` is public in `apps/admin/middleware.ts`. The form posts
   `POST /auth/activate { token, password }` with `x-tenant-host`
   (`AuthController.activate` → `AuthService.activateAccount`). If the host names a gym
   the account has no membership in, the answer is `403 TENANT_MISMATCH` **before** the
   token is spent; with no tenant host there is nothing to compare. Otherwise the token
   is deleted (single-use, delete-wins), the password set, `emailVerifiedAt` stamped,
   and every existing session revoked. An unknown or used token is
   `400 TOKEN_INVALID_OR_EXPIRED`.
4. **Sign in** — the API returns `{ email }` and **no session**; the form redirects to
   `/admin/login?email=…&activated=1`. The owner's first sign-in is a real one on this
   host, so the session carries this gym's `gymSlug` and its cookies are host-only. A
   link forwarded to the wrong inbox yields no console, only a chance to set a password.

## Mail link precedence

Which host each mailed link lands on, first match wins. The reasons are under
[How this is actually deployed](#how-this-is-actually-deployed-2026-09).

| Link                                | Builder                   | Precedence                                                                                                               |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/member/verify?token=`             | `buildVerificationUrl`    | gym host (slug known) → `EMAIL_VERIFICATION_URL` → `WEB_URL` → localhost                                                 |
| `/member/reset-password?token=`     | `buildPasswordResetUrl`   | gym host (the `x-tenant-host` gym, only if the account is a member there) → `PASSWORD_RESET_URL` → `WEB_URL` → localhost |
| `/admin/activate?token=`            | `buildOwnerOnboardingUrl` | `OWNER_ONBOARDING_URL` → gym console → `ADMIN_URL` console → `localhost:3002`                                            |
| `API_PUBLIC_URL/auth/accept-invite` | `buildInviteAcceptUrl`    | 302 → `https://<slug>.<root>/member/{register,login}?inviteToken=…`; an unknown token → `WEB_URL`                        |
| digests, ops notifications          | `buildConsoleUrl`         | gym console → `ADMIN_URL` console → no link                                                                              |

The member links resolve through `memberLinkBase` (`email.service.ts`), the console
links through `apps/api/src/common/console-url.ts`.

## How this is actually deployed (2026-09)

`fit.ge` above is only a placeholder. The real root domain is **`formacore.io`**, and
option **B** (wildcard, Vercel Pro) is what is live:

| Host                      | Vercel project   |
| ------------------------- | ---------------- |
| `*.formacore.io`          | `fit-web`        |
| `formacore.io` (apex)     | `fit-platform`   |
| `superadmin.formacore.io` | `fit-superadmin` |
| — (no custom domain)      | `fit-admin`      |

- **Every link the API mails is addressed at the gym it is about** —
  `https://<slug>.formacore.io/…`, built in `apps/api/src/common/console-url.ts` over
  `tenantOrigin` (`packages/utils/src/tenant-host.ts`) from `PLATFORM_ROOT_DOMAIN` and
  the gym's own slug. Two builders, because the two surfaces sit differently:
  `buildConsoleUrl` joins `ADMIN_BASE_PATH` (the console is served under `/admin`) and
  may return nothing, since a digest with no link is merely degraded;
  `buildMemberUrl` joins no prefix (the member site is at its host's root) and always
  returns a string, since a verification mail with no link is useless. Neither adds a
  locale prefix — the web middleware inserts `/<locale>` itself and keeps `?token=`.
  So a digest for Downtown opens Downtown's console, and a member who signed up at
  Downtown verifies on Downtown's site, rather than on whichever gym the recipient's
  last session happened to select.
- **Token links put the gym's host ahead of the env override.** `EMAIL_VERIFICATION_URL`
  and `PASSWORD_RESET_URL` are set on Railway to `https://app.formacore.io/member/…`;
  while they won over the slug, every gym's verification mail opened the generic
  portal. `memberLinkBase` (`apps/api/src/auth/email.service.ts`) now reads: the gym's
  own host when a slug is known → the env override → `WEB_URL` → localhost. The
  overrides only ever cover flows that name no gym — the mobile app, `app.<root>`, a
  reset asked for on a gym the account does not belong to. They are harmless left as
  they are; removing them is optional and has to be done in the Railway dashboard (the
  CLI can set a variable but not delete one), after which those flows fall to
  `WEB_URL`, which is the same `app.formacore.io`.
- **Password reset is addressed at the host it was asked for on.** The web form sends
  `x-tenant-host` (`accountHeaders` in `apps/web/lib/auth.ts`), and
  `POST /auth/forgot-password` resolves the slug like `POST /auth/refresh`. The link
  goes to that gym only when the account holds a membership there — the host is
  caller-chosen, and must not steer a stranger's token to a site of the caller's
  choosing. The mobile app, `app.<root>`, and a gym the account does not belong to
  get the override. The staff console's "forgot password?" opens the same host's
  `/member/forgot-password`; the reset signs them in and `postLoginPath` sends staff
  to `/admin`.
- **A reset's session stays on the host it was completed on.** `POST /auth/reset-password`
  reads the tenant host like `POST /auth/refresh`. The password is written (and every
  session revoked) first; then, on `<slug>.<root>`, the new session binds to that gym
  only when the account is an active member of it (gym active too). Otherwise no session
  is issued — `{ ok: true, sessionIssued: false }` (`ResetPasswordResponse` in
  `packages/types/src/auth.ts`) — and the web form sends them to
  `/member/login?reset=done`, never onto their primary gym. A tenant-less host
  (`app.<root>`, the mobile app) keeps the primary-gym session.
- **Staff-invite redirects land on the inviting gym.** The mailed link still points at
  the API (`GET /auth/accept-invite`); its 302 now goes to
  `https://<slug>.<root>/member/{register,login}?inviteToken=…`, so the session the
  invite ends in is created on the host it belongs to. Only an unknown token — which
  names no gym — goes to `WEB_URL`.
- **`WEB_URL` / `ADMIN_URL` are the fallback**, for the cases with no slug to address:
  they are bare origins, and the console's `/admin` prefix comes from
  `ADMIN_BASE_PATH`, never from the URL. Set them to `https://app.formacore.io` — `app`
  is in `RESERVED_SUBDOMAINS` (`packages/types/src/gyms.ts`), so no gym can ever claim
  it, and the wildcard resolves it to `fit-web` like any other label. It renders the
  generic portal (no tenant in scope) and holds a host-only session of its own. Keep
  it on a host under `formacore.io` rather than a `*.vercel.app` one: the mailed links
  should stay on the product's domain, where the API's CORS root-domain rule already
  admits them.
- **The admin proxy is set explicitly in production**, not left to the code defaults:
  `ADMIN_BASE_PATH=/admin` on `fit-admin`, and
  `ADMIN_ORIGIN=https://fit-admin-fitspace676-5825s-projects.vercel.app` on `fit-web`.
  `fit-admin` has no custom domain — it is reached through the proxy, or directly on
  that `*.vercel.app` origin for debugging.
- **`COOKIE_DOMAIN=.formacore.io` / `NEXT_PUBLIC_COOKIE_DOMAIN=.formacore.io` are
  still set on `fit-web` and `fit-admin`, on purpose.** The code no longer writes a
  `Domain=` cookie; the value only tells every clear and fresh write which legacy
  parent-domain copy to expire. Remove both from Vercel once the old cookies can no
  longer exist — the refresh token's 30-day lifetime after the host-only release is
  deployed. Removing them earlier leaves those old cookies in browsers, where the
  middleware still refuses them on any other gym's host but can no longer delete them.
- **Railway** needs nothing new for tenant resolution: the API reads the host from
  `x-tenant-host` / `Forwarded`, both of which survive its edge.

## CORS

The API allows credentialed requests from every tenant subdomain automatically:
`isOriginAllowed` (`apps/api/src/common/cors/allowed-origin.ts`) permits any Origin
whose host is `PLATFORM_ROOT_DOMAIN` or a subdomain of it, on top of the explicit
`WEB_URL` / `ADMIN_URL` / `CORS_ORIGINS` list. So set `PLATFORM_ROOT_DOMAIN` on the
API (Railway) to the same root domain — no per-gym CORS entry is needed. The
browser's `x-tenant-host` makes a cross-origin call non-simple, so it is
preflighted; `enableCors` (`apps/api/src/main.ts`) sets no `allowedHeaders`, so the
preflight reflects the requested headers and admits it. Pin an explicit list there
and `x-tenant-host` has to be on it.

## Notes / future work

- The platform signup form that calls `tenantAdminUrl(slug)` lands in **T3.11**.
- Per-gym document branding (title, icon, `theme-color`) is in — see
  [Branding per gym](#branding-per-gym) (#333, part of **T4.8**).
