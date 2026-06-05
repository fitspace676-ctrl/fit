# @fit/admin

Internal admin console — [Next.js 15](https://nextjs.org/) (App Router) with
TypeScript and [Tailwind CSS](https://tailwindcss.com/) wired to the shared
`@fit/config` theme tokens. Deploys to [Vercel](https://vercel.com/).

## Layout

```
app/
├── layout.tsx          # root layout — html/body shell, global styles
├── (dashboard)/        # authenticated route group (wrapped in the console shell)
│   ├── layout.tsx      # AdminShell — sidebar + top bar; resolves the active gym
│   └── page.tsx        # dashboard landing
├── 403/page.tsx        # public — rendered bare (no shell)
└── globals.css         # Tailwind directives
components/
├── admin-shell.tsx     # shell chrome + responsive mobile drawer state
├── sidebar.tsx         # role-aware nav (visibleNavItems × active route)
├── top-bar.tsx         # active gym, role badge, sign-out, mobile toggle
└── nav-icon.tsx        # inline SVG glyphs (no icon dependency)
lib/nav.ts              # NAV_ITEMS + visibleNavItems()/isNavItemActive()
tailwind.config.mjs     # extends @fit/config/tailwind preset
next.config.mjs         # Next.js config (lint handled by turbo)
```

### Role-aware navigation

`lib/nav.ts` declares every sidebar destination with an optional capability
(`@fit/types` `Permission`) and/or minimum role. `visibleNavItems(role)` filters
that list with the same `roleHasPermission` matrix the API enforces and the role
ranking from `middleware.ts`, so a link is shown only when the route is actually
reachable — it never lands the user on `/403`. The server re-checks every request;
the client filter only decides what the UI offers.

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Dev server on http://localhost:3002       |
| `pnpm build`      | Production build (`next build`)           |
| `pnpm start`      | Serve the production build on port 3002   |
| `pnpm lint`       | ESLint (shared `@fit/config` flat config) |
| `pnpm type-check` | `tsc --noEmit`                            |

Run from the repo root via Turborepo:

```bash
pnpm turbo run build --filter=@fit/admin
pnpm turbo run dev --filter=@fit/admin
```

## Tailwind

`tailwind.config.mjs` pulls in the shared preset (`@fit/config/tailwind`), so
brand colors (`brand-*`), `font-sans`, `rounded-card`, and `p-gutter` resolve
to the same tokens used across every Fit surface.

## Vercel

Create a Vercel project pointed at this directory:

- **Root Directory**: `apps/admin`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@fit/admin`
  (also pinned in `vercel.json`)
- **Install Command**: default (`pnpm install` — resolves the workspace lockfile)

Opening a PR against `main` triggers a preview deploy; Vercel posts the preview
URL as a PR comment.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
