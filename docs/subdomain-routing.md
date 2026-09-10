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
being mistaken for one. Its session cookies are named `ops*` and written
**host-only**, so they neither read nor overwrite the parent-domain `accessToken`
the tenant surfaces share.

### Three cookie scopes, on purpose

| Cookie                                     | Scope                          | Set by                       |
| ------------------------------------------ | ------------------------------ | ---------------------------- |
| `accessToken` / `refreshToken`             | parent domain `.<root>`        | web + admin sign-in          |
| `opsAccessToken` / `opsRefreshToken`       | host-only, `superadmin.<root>` | the operator console         |
| `impersonationToken` / `impersonationMeta` | host-only, one `<slug>.<root>` | `/admin/impersonation/start` |

The tenant session is shared across a gym's portal and console by design. The
other two are deliberately not: an operator holding a SUPER_ADMIN session and
acting as one gym's owner in another tab are three identities that must not
overwrite each other. `pickSessionToken` (`apps/admin/lib/auth-session.ts`) is
the one place the precedence lives — impersonation wins where it exists.

The active gym is derived from the request **Host**, not hard-coded. Everything is
domain-agnostic via env, so connecting a real domain (or switching to a wildcard on
a Vercel Pro upgrade) needs **no code change** — only the env + DNS + Vercel domain
entries below.

## How it works (code)

- **API** — `SubdomainTenantMiddleware` (`apps/api/src/common/middleware/subdomain-tenant.middleware.ts`) recovers the slug from `Host` via `extractTenantSlug(host, PLATFORM_ROOT_DOMAIN)` and scopes **public/unauthenticated** requests to that gym. Authenticated requests are scoped by their JWT (`gymId` claim) — the session always wins over the host.
- **Login binding** — a credentials sign-in on `<slug>.<root>` forwards the slug (`loginSchema.gymSlug`); `AuthService.resolveSessionScope(userId, gymSlug)` binds the issued token to that gym when the user has a membership there, else falls back to their earliest-joined (primary) gym. So an authed request on a subdomain carries the matching `gymId`.
- **Frontend** — `extractGymSlug(host, rootDomain)` (`@fit/utils`) is the shared helper. `getActiveGymSlug()` (`apps/web/lib/active-gym.ts`, `apps/admin/lib/active-gym.ts`) reads it in Server Components from `next/headers`. `apps/web/lib/auth.ts` reads `window.location.host` at sign-in to set `gymSlug`.
- **Cookie sharing** — set `COOKIE_DOMAIN` / `NEXT_PUBLIC_COOKIE_DOMAIN` to `.<root>` so the session cookie is shared across subdomains (web sets it, admin reads it).

## Env

Set the same root domain on the API and all three Next apps:

```
# API (apps/api) — also the base of every tenant link the API mails.
# Defaults to "localhost", so an unset production deployment builds visibly
# broken `<slug>.localhost` links rather than leaking tokens to a real domain.
PLATFORM_ROOT_DOMAIN="fit.ge"

# web / admin / platform
NEXT_PUBLIC_ROOT_DOMAIN="fit.ge"

# web + admin (prod) — share the session cookie across subdomains
NEXT_PUBLIC_COOKIE_DOMAIN=".fit.ge"
COOKIE_DOMAIN=".fit.ge"
```

## Local development

`*.localhost` resolves to `127.0.0.1` automatically in Chrome/Edge — **no hosts-file
edit needed**. Set:

```
PLATFORM_ROOT_DOMAIN="localhost"
NEXT_PUBLIC_ROOT_DOMAIN="localhost"
# leave COOKIE_DOMAIN unset locally → host-only cookie
```

Then `pnpm dev` and visit:

- `http://downtown.localhost:3001` — member site for the `downtown` gym
- `http://downtown.localhost:3002/admin` — staff console for `downtown`
- `http://localhost:3003` — platform marketing (apex)

Seed two tenants first: `pnpm db:seed` (or `fit db seed`) creates `downtown` + `riverside`.
Sign in as `alex@example.com` on `downtown.localhost:3001` → the session binds to the
`downtown` gym (OWNER); on `riverside.localhost:3001` it binds to `riverside` (TRAINER).

> Firefox/Safari don't auto-resolve `*.localhost`; add `127.0.0.1 downtown.localhost`
> to `/etc/hosts` per slug, or test in Chrome.

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
3. The shared session cookie (`COOKIE_DOMAIN=.<root>`) means a sign-in on
   `<slug>.<root>` is already visible to the console at `<slug>.<root>/admin`.

With both env vars unset the defaults above still give you the proxied layout, so
`fit-admin` answers under `/admin` on its own `*.vercel.app` host too. To serve the
console at the root instead, set `ADMIN_BASE_PATH` to the **empty string** on it (what
`apps/e2e` does) — and the same on the API, which appends the prefix to `ADMIN_URL`
when it builds console links. This needs a live deploy to verify end-to-end
(cross-project proxy + cookies).

> Single-host alternative (simplest for a first test): point one host
> (`manage.<root>` → `fit-admin`, **no** base path / proxy) and let the console read
> the gym from the shared session cookie. Works for single-gym owners; drop it once
> the `/admin` proxy is verified.

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
  `https://<slug>.formacore.io/…`, built by `buildConsoleUrl`
  (`apps/api/src/common/console-url.ts`) over `tenantOrigin`
  (`packages/utils/src/tenant-host.ts`) from `PLATFORM_ROOT_DOMAIN` and the gym's own
  slug. So a digest for Downtown opens Downtown's console, not whichever gym the
  recipient's last session happened to select.
- **`WEB_URL` / `ADMIN_URL` are the fallback**, for the cases with no slug to address:
  they are bare origins, and the console's `/admin` prefix comes from
  `ADMIN_BASE_PATH`, never from the URL. Set them to `https://app.formacore.io` — `app`
  is in `RESERVED_SUBDOMAINS` (`packages/types/src/gyms.ts`), so no gym can ever claim
  it, the wildcard resolves it to `fit-web` like any other slug, and it carries the
  parent-domain session cookie that a `*.vercel.app` host cannot. A `*.vercel.app`
  host here is a **functional** bug, not a cosmetic one: the browser rejects a
  `domain=.formacore.io` cookie there, so the link can never establish a session.
- **The admin proxy is set explicitly in production**, not left to the code defaults:
  `ADMIN_BASE_PATH=/admin` on `fit-admin`, and
  `ADMIN_ORIGIN=https://fit-admin-fitspace676-5825s-projects.vercel.app` on `fit-web`.
  `fit-admin` has no custom domain — it is reached through the proxy, or directly on
  that `*.vercel.app` origin for debugging.

## CORS

The API allows credentialed requests from every tenant subdomain automatically:
`isOriginAllowed` (`apps/api/src/common/cors/allowed-origin.ts`) permits any Origin
whose host is `PLATFORM_ROOT_DOMAIN` or a subdomain of it, on top of the explicit
`WEB_URL` / `ADMIN_URL` / `CORS_ORIGINS` list. So set `PLATFORM_ROOT_DOMAIN` on the
API (Railway) to the same root domain — no per-gym CORS entry is needed.

## Notes / future work

- Refresh tokens carry no subdomain, so a refresh re-pins to the primary gym; a
  subdomain session is refreshed from the same subdomain. Threading an explicit gym
  claim through refresh (per-request authed re-scoping across subdomains without
  re-login) is a future enhancement.
- The platform signup form that calls `tenantAdminUrl(slug)` lands in **T3.11**.
- Per-gym branding/theming by slug lands in **T4.8**.
