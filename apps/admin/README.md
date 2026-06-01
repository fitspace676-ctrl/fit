# @fit/admin

Internal admin console — [Next.js 15](https://nextjs.org/) (App Router) with
TypeScript and [Tailwind CSS](https://tailwindcss.com/) wired to the shared
`@fit/config` theme tokens. Deploys to [Vercel](https://vercel.com/).

## Layout

```
app/
├── layout.tsx      # root layout — html/body shell, global styles
├── page.tsx        # placeholder homepage
└── globals.css     # Tailwind directives
tailwind.config.mjs # extends @fit/config/tailwind preset
next.config.mjs     # Next.js config (lint handled by turbo)
```

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
