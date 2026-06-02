# Subdomain routing & multi-tenancy

Each gym (tenant) is served at `<slug>.<rootDomain>`:

| Surface                  | Host                            | App               |
| ------------------------ | ------------------------------- | ----------------- |
| Member site              | `<slug>.<root>`                 | `@fit/web`        |
| Staff console            | `<slug>.<root>/admin`           | `@fit/admin`      |
| Marketing / owner signup | `<root>` (apex)                 | `@fit/platform`   |
| Operator console         | `ops.<root>` (or separate host) | `@fit/superadmin` |

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
# API (apps/api)
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

## Notes / future work

- Refresh tokens carry no subdomain, so a refresh re-pins to the primary gym; a
  subdomain session is refreshed from the same subdomain. Threading an explicit gym
  claim through refresh (per-request authed re-scoping across subdomains without
  re-login) is a future enhancement.
- The platform signup form that calls `tenantAdminUrl(slug)` lands in **T3.11**.
- Per-gym branding/theming by slug lands in **T4.8**.
