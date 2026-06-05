# @fit/platform

Our SaaS acquisition surface — public marketing site + gym-owner signup. Served
at the **root domain** (`fit.ge` / `www.fit.ge`) and **not** tenant-scoped (a
brand-new gym has no subdomain yet; on successful signup the app redirects the
owner to their tenant admin at `<slug>.fit.ge/admin`).

[Next.js 15](https://nextjs.org/) (App Router) with TypeScript and
[Tailwind CSS](https://tailwindcss.com/) wired to the shared `@fit/config` theme
tokens. Deploys to [Vercel](https://vercel.com/).

> Distinct from `apps/web` (tenant-scoped member site) and `apps/admin`
> (tenant-scoped staff console). The owner-signup flow (`register-gym`) lands
> here in T3.11.

## Layout

```
app/
├── layout.tsx           # root layout — html/body shell, global styles
├── page.tsx             # marketing homepage (header → hero → features → pricing → CTA → footer)
├── register-gym/page.tsx# owner-signup page — every marketing CTA funnels here
├── error.tsx            # route-segment error boundary
├── global-error.tsx     # root error boundary
└── globals.css          # Tailwind directives
components/
├── marketing/           # static landing sections (server components)
└── signup/              # register-gym form + form controls (client)
lib/
├── env.ts               # validated NEXT_PUBLIC_* env
├── register-gym.ts      # POST /auth/register-gym client
├── slugify.ts           # gym-name → subdomain-slug suggestion
└── tenant-url.ts        # build the <slug>.<root>/admin redirect target
tailwind.config.mjs      # extends @fit/config/tailwind preset
next.config.mjs          # Next.js config (lint handled by turbo)
```

## Owner signup

`/register-gym` collects the gym name, subdomain, and the owner's email (with an
optional name + password) and POSTs them to `POST /auth/register-gym`. The
subdomain is auto-suggested from the gym name (validated server-side by
`gymSlugSchema`). Provisioning issues **no session** — the API emails the owner a
verification link — so on success the form shows a "check your inbox" notice and
links on to the freshly provisioned tenant console at `<slug>.<root>/admin`
(built via `lib/tenant-url.ts`; falls back to an in-app confirmation when
`NEXT_PUBLIC_ROOT_DOMAIN` is unset).

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Dev server on http://localhost:3003       |
| `pnpm build`      | Production build (`next build`)           |
| `pnpm start`      | Serve the production build on port 3003   |
| `pnpm lint`       | ESLint (shared `@fit/config` flat config) |
| `pnpm type-check` | `tsc --noEmit`                            |

Run from the repo root via Turborepo:

```bash
pnpm turbo run build --filter=@fit/platform
pnpm turbo run dev --filter=@fit/platform
```

## Tailwind

`tailwind.config.mjs` pulls in the shared preset (`@fit/config/tailwind`), so
brand colors (`brand-*`), `font-sans`, `rounded-card`, and `p-gutter` resolve
to the same tokens used across every Fit surface.

## Vercel

Create a Vercel project pointed at this directory:

- **Root Directory**: `apps/platform`
- **Framework Preset**: Next.js
- **Build Command**: `cd ../.. && pnpm turbo run build --filter=@fit/platform`
  (also pinned in `vercel.json`)
- **Install Command**: default (`pnpm install` — resolves the workspace lockfile)
- **Domains**: root/apex domain (`fit.ge`, `www.fit.ge`)

Opening a PR against `main` triggers a preview deploy; Vercel posts the preview
URL as a PR comment.

## Configuration

Copy `.env.example` → `.env.local` (gitignored) and fill in the values.
