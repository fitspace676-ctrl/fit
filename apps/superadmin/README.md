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
> **platform** operator console. The `gyms` management page and full feature set
> land in T2.12.

## Auth

The whole app is SUPER_ADMIN-gated at the middleware level (`middleware.ts`).
That file is currently a **pass-through stub** so preview deploys render — the
real session check + `SUPER_ADMIN` role assertion is implemented in **T2.12**.

## Layout

```
app/
├── layout.tsx      # root layout — html/body shell, global styles
├── page.tsx        # placeholder homepage
├── error.tsx       # route-segment error boundary
├── global-error.tsx# root error boundary
└── globals.css     # Tailwind directives
middleware.ts       # SUPER_ADMIN access gate (stub — see T2.12)
tailwind.config.mjs # extends @fit/config/tailwind preset
next.config.mjs     # Next.js config (lint handled by turbo)
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
