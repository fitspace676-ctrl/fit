import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// Point the next-intl plugin at the per-request config (cookie locale + messages).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

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
  reactStrictMode: true,
  ...(adminBasePath ? { basePath: adminBasePath } : {}),
  env: { NEXT_PUBLIC_ADMIN_BASE_PATH: adminBasePath },
  images: { remotePatterns: r2RemotePatterns() },
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
export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'forma-0r',
  project: 'fit-admin',
  sentryUrl: 'https://de.sentry.io/',
  silent: true,
  widenClientFileUpload: true,
  // Don't fail the build if Sentry source-map upload errors.
  errorHandler: () => {},
});
