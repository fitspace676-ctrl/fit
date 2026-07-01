import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// Point the next-intl plugin at the per-request config (locale + messages).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

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
export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'forma-0r',
  project: 'fit-web',
  sentryUrl: 'https://de.sentry.io/',
  silent: true,
  widenClientFileUpload: true,
  // Don't fail the build if Sentry source-map upload errors.
  errorHandler: () => {},
});
