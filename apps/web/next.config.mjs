import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import stylexPlugin from '@stylexswc/nextjs-plugin';

// Point the next-intl plugin at the per-request config (locale + messages).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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

// The staff console (@fit/admin) is a separate deployment, but in the subdomain
// model it is served at `<slug>.<root>/admin`. When `ADMIN_ORIGIN` is set (e.g.
// `https://admin-origin.fit.ge`), proxy `/admin/*` to that deployment — which runs
// with `ADMIN_BASE_PATH=/admin`, so its routes and assets line up under the prefix.
// Unset (the default) → no proxy, and `/admin` simply 404s as before.
const adminOrigin = (
  process.env.ADMIN_ORIGIN ?? 'https://fit-admin-fitspace676-5825s-projects.vercel.app'
).replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: r2RemotePatterns() },
  // Tree-shake the barrel imports the redesigned portal leans on most (T9.9):
  // `next-intl` is imported across ~40 client/server components and `motion`
  // pulls a large animation runtime. `optimizePackageImports` rewrites these to
  // direct submodule imports so only what each screen uses ships to the browser,
  // trimming the client bundle and improving TBT/LCP on the portal's Lighthouse.
  experimental: { optimizePackageImports: ['next-intl', 'motion'] },
  async rewrites() {
    if (!adminOrigin) return [];
    return [
      { source: '/admin', destination: `${adminOrigin}/admin` },
      { source: '/admin/:path*', destination: `${adminOrigin}/admin/:path*` },
    ];
  },
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
  project: 'fit-web',
  sentryUrl: 'https://de.sentry.io/',
  silent: true,
  widenClientFileUpload: true,
  // Don't fail the build if Sentry source-map upload errors.
  errorHandler: () => {},
});
