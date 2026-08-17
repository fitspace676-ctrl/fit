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

// Locale prefixes next-intl serves, as a path-to-regexp alternation for the
// legacy-redirect rules below. Kept in sync with `@fit/i18n`'s `locales` by hand
// because next.config.mjs is loaded before the TS path aliases resolve.
const LOCALE_PATTERN = 'ka|en';

/**
 * Top-level segments that moved from `/<locale>/…` to `/<locale>/member/…` when
 * the member portal took over its own base path. Every one of these had public,
 * linkable URLs — class and trainer detail pages are shared, the password-reset
 * link is emailed — so each needs a permanent redirect rather than a 404.
 */
const MOVED_MEMBER_SEGMENTS = [
  'home',
  'classes',
  'trainers',
  'shop',
  'cart',
  'account',
  'checkout',
  'login',
  'register',
  'forgot-password',
  'reset-password',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `@fit/ui-kit` ships TypeScript with un-compiled `stylex.create()` calls.
  // Next does not run its SWC pipeline over node_modules by default, and a pnpm
  // workspace package is symlinked in there — so without this the StyleX plugin
  // never sees the kit and its `stylex.create` reaches the runtime, which throws.
  transpilePackages: ['@fit/ui-kit'],
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
  // The member portal moved from the locale root to its own `/member` segment
  // (`/ka/home` → `/ka/member/home`), mirroring how the staff console owns
  // `/admin`. Permanently redirect the old locale-rooted paths so existing
  // bookmarks, emailed deep links, and search results keep resolving. The locale
  // is matched explicitly because next-intl — not Next's built-in i18n — owns the
  // prefix, so Next does not strip it before matching. Only the marketing landing
  // (`/:locale`) and the 403 page stay at the root, so they are not listed here.
  async redirects() {
    return [
      ...MOVED_MEMBER_SEGMENTS.map((segment) => ({
        source: `/:locale(${LOCALE_PATTERN})/${segment}/:path*`,
        destination: `/:locale/member/${segment}/:path*`,
        permanent: true,
      })),
      ...MOVED_MEMBER_SEGMENTS.map((segment) => ({
        source: `/:locale(${LOCALE_PATTERN})/${segment}`,
        destination: `/:locale/member/${segment}`,
        permanent: true,
      })),
      // The staff console is locale-less: it owns `/admin`, and its own language
      // switcher drives a cookie rather than the URL. But `/ka/admin` is what an
      // operator types once every member URL carries a locale, and without these
      // it fell to the member gate and landed on the *portal's* sign-in — the
      // wrong door, with a `from` pointing back at a path the console does not
      // serve. Send the locale-prefixed form to the console's own entrance.
      //
      // A redirect rather than a rewrite because Next's `basePath` is one static
      // string: the console cannot answer on `/ka/admin` and `/en/admin` at once,
      // so the URL has to collapse to the single prefix it is built for.
      {
        source: `/:locale(${LOCALE_PATTERN})/admin/:path*`,
        destination: '/admin/:path*',
        permanent: true,
      },
      {
        source: `/:locale(${LOCALE_PATTERN})/admin`,
        destination: '/admin',
        permanent: true,
      },
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
