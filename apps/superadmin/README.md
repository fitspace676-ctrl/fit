# @fit/superadmin

Platform operator console — **SUPER_ADMIN-only**. Served at a **separate host**
(e.g. `ops.fit.ge`) and used by us (the platform operators) to manage gyms
across the whole system: list/suspend gyms, impersonate owners, inspect
platform-wide state. SuperAdmin bypasses tenant scoping (`@AllowCrossTenant` on
the API side).

[Next.js 15](https://nextjs.org/) (App Router) with TypeScript and
[Tailwind CSS](https://tailwindcss.com/) wired to the shared `@fit/config` theme
tokens. Deploys to [Vercel](https://vercel.com/).

> Distinct from `apps/admin` (tenant-scoped **gym** staff console). This is the
> **platform** operator console — the `gyms` management page (T2.12) lists every
> gym, toggles suspension, and impersonates owners.

## Auth

The whole app is SUPER_ADMIN-gated at the middleware level (`middleware.ts`): it
verifies the shared `accessToken` cookie with the same HS256 check the API uses
(Web Crypto, Edge-safe) and asserts the `SUPER_ADMIN` role, redirecting everyone
else to `/403`. With `JWT_SECRET` unset the gate fails closed. There is no
sign-in UI here — operators obtain a SUPER_ADMIN session via the shared-domain
auth cookie. Server Components / Actions re-resolve the session with
`getServerSession()` (`lib/session.ts`).

## Gyms console (T2.12)

`/gyms` server-renders `GET /admin/gyms` (cross-tenant, SUPER_ADMIN-only) and
drives three operator actions through Server Actions that forward the operator's
bearer token to the API:

- **Suspend / reactivate** → `PATCH /admin/gyms/:id/status`. A suspended gym
  blocks its staff + members from new sessions (login + the next refresh).
- **Impersonate owner** → `POST /admin/gyms/:id/impersonate` returns a
  short-lived, gym-scoped owner token; every call is audit-logged.

## Layout

```
app/
├── layout.tsx        # root layout — html/body shell, global styles
├── page.tsx          # redirects to /gyms
├── 403/page.tsx      # access-denied page (the only public route)
├── gyms/
│   ├── page.tsx       # server-rendered gym roster
│   ├── gyms-table.tsx # client table — status toggle + impersonate
│   └── actions.ts     # Server Actions (status update, impersonation)
├── error.tsx         # route-segment error boundary
├── global-error.tsx  # root error boundary
└── globals.css       # Tailwind directives
lib/
├── auth-session.ts   # isomorphic session core (verify JWT, SUPER_ADMIN gate)
├── session.ts        # getServerSession() for RSC / actions
└── api.ts            # server-side @fit/api client (/admin/gyms)
middleware.ts         # SUPER_ADMIN access gate
tailwind.config.mjs   # extends @fit/config/tailwind preset
next.config.mjs       # Next.js config (lint handled by turbo)
```

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
pnpm turbo run build --filter=@fit/superadmin
pnpm turbo run dev --filter=@fit/superadmin
```

## Tailwind

`tailwind.config.mjs` pulls in the shared preset (`@fit/config/tailwind`), so
brand colors (`brand-*`), `font-sans`, `rounded-card`, and `p-gutter` resolve
to the same tokens used across every Fit surface.

## Vercel

Create a Vercel project pointed at this directory:

- **Root Directory**: `apps/superadmin`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@fit/superadmin`
  (also pinned in `vercel.json`)
- **Install Command**: default (`pnpm install` — resolves the workspace lockfile)
- **Domains**: dedicated operator host (e.g. `ops.fit.ge`) — never the root or a
  tenant subdomain.

Opening a PR against `main` triggers a preview deploy; Vercel posts the preview
URL as a PR comment.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
