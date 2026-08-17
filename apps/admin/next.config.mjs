import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import stylexPlugin from '@stylexswc/nextjs-plugin';

// Point the next-intl plugin at the per-request config (cookie locale + messages).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * StyleX SWC compiler (T11.2). Astryx components ship pre-compiled CSS, but any
 * app-authored `stylex.create()` + `xstyle` (layout wrappers, page grids, one-off
 * spacing on Astryx components) must be compiled at build time — the
 * `@stylexjs/stylex` runtime throws if `stylex.create` is reached un-compiled.
 *
 * We use the NAPI-RS SWC compiler rather than the Babel plugin so Next keeps its
 * default SWC transform — critical here because `next/font/google` refuses to run
 * under a custom Babel config. The webpack plugin extracts StyleX atoms into their
 * own stylesheet, injected independently of the Tailwind PostCSS pipeline (which
 * still owns `globals.css`), so the two coexist during the migration (T11.6).
 */
const withStylex = stylexPlugin({
  rsOptions: {
    dev: process.env.NODE_ENV !== 'production',
    // Resolve cross-package token imports (e.g. `@astryxdesign/core/theme/tokens.stylex`).
    unstable_moduleResolution: { type: 'commonJS', rootDir },
    // Mirror the tsconfig `@/*` path alias so `stylex.create` in aliased modules resolves.
    aliases: { '@/*': [path.join(rootDir, '*')] },
  },
});

/**
 * Allow `next/image` to optimise objects served from the Cloudflare R2 public
 * bucket. The exact host comes from `R2_PUBLIC_URL` (custom domain or `*.r2.dev`)
 * when set; the wildcard fallbacks cover R2's default public hostnames so images
 * still load before a custom domain is configured.
 */
function r2RemotePatterns() {
  const patterns = [
    { protocol: 'https', hostname: '**.r2.dev' },
    { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
  ];

  const publicUrl = process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (publicUrl) {
    try {
      const { protocol, hostname } = new URL(publicUrl);
      patterns.push({ protocol: protocol.replace(':', ''), hostname });
    } catch {
      // A malformed URL is surfaced by env validation (@fit/env), not here.
    }
  }

  return patterns;
}

// When the staff console is served under a path of a tenant subdomain
// (`<slug>.<root>/admin`, proxied from @fit/web), it must own that path prefix so
// its routes and `_next` assets resolve under it. Set `ADMIN_BASE_PATH=/admin` on
// the deployment that sits behind the proxy; unset (the default) keeps the app at
// the root so its standalone `*.vercel.app` deployment is unaffected. Exposed to
// the client as `NEXT_PUBLIC_ADMIN_BASE_PATH` so same-origin fetches can prefix it
// (Next only auto-applies basePath to navigation/assets, not `fetch`).
const adminBasePath = process.env.ADMIN_BASE_PATH ?? '/admin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `@fit/ui-kit` ships TypeScript with un-compiled `stylex.create()` calls.
  // Next does not run its SWC pipeline over node_modules by default, and a pnpm
  // workspace package is symlinked in there — so without this the StyleX plugin
  // never sees the kit and its `stylex.create` reaches the runtime, which throws.
  transpilePackages: ['@fit/ui-kit'],
  reactStrictMode: true,
  ...(adminBasePath ? { basePath: adminBasePath } : {}),
  env: { NEXT_PUBLIC_ADMIN_BASE_PATH: adminBasePath },
  images: { remotePatterns: r2RemotePatterns() },
  // The retail catalog moved out of the Payments hub to its own top-level Shop
  // destination. Permanently redirect the old `/payments/products*` paths (and any
  // drill-down: detail, edit, new, low-stock) to their `/shop*` equivalents so
  // existing bookmarks and links keep resolving. basePath is applied automatically.
  // Creating a product is a drawer over the catalog (`AddProductDrawer`), not a
  // page, so `/shop/new` no longer exists — send it (and the old Payments-hub path
  // that now lands on it) to the catalog it opens over.
  async redirects() {
    return [
      { source: '/shop/new', destination: '/shop', permanent: true },
      { source: '/payments/products', destination: '/shop', permanent: true },
      { source: '/payments/products/:path*', destination: '/shop/:path*', permanent: true },
    ];
  },
  // `next-intl` is imported across the console's client/server components;
  // `optimizePackageImports` rewrites its barrel imports to direct submodule
  // imports so each admin screen ships only what it uses, trimming the client
  // bundle and admin TTI (T9.9).
  experimental: { optimizePackageImports: ['next-intl'] },
  // Lint and type-check run as dedicated turbo tasks (`pnpm lint`,
  // `pnpm type-check`) with the shared @fit/config presets, so skip Next's
  // bundled ESLint pass — it expects eslint-config-next, which this monorepo
  // does not use.
  eslint: { ignoreDuringBuilds: true },
};

// Upload source maps to Sentry at build time so production stack traces are
// un-minified. The auth token comes from the `SENTRY_AUTH_TOKEN` build env var
// (set in Vercel); without it the plugin no-ops the upload (non-fatal), so local
// and unauthenticated builds still succeed.
export default withSentryConfig(withNextIntl(withStylex(nextConfig)), {
  org: 'forma-0r',
  project: 'fit-admin',
  sentryUrl: 'https://de.sentry.io/',
  silent: true,
  widenClientFileUpload: true,
  // Don't fail the build if Sentry source-map upload errors.
  errorHandler: () => {},
});
