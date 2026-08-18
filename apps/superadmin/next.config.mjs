import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withSentryConfig } from '@sentry/nextjs';
import stylexPlugin from '@stylexswc/nextjs-plugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * StyleX SWC compiler. The operator console is authored entirely against
 * `@fit/ui-kit` + Astryx — there is no Tailwind here, so every rule this app
 * writes goes through `stylex.create()`, which must be compiled at build time
 * (the runtime throws if it is reached un-compiled).
 *
 * The NAPI-RS SWC compiler rather than the Babel plugin, for the same reason the
 * console uses it: `next/font/google` refuses to run under a custom Babel config.
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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `@fit/ui-kit` ships TypeScript with un-compiled `stylex.create()` calls, and
  // Next does not run its SWC pipeline over node_modules (where pnpm symlinks a
  // workspace package) by default — so without this the plugin never sees the kit.
  transpilePackages: ['@fit/ui-kit'],
  reactStrictMode: true,
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
export default withSentryConfig(withStylex(nextConfig), {
  org: 'forma-0r',
  project: 'fit-superadmin',
  sentryUrl: 'https://de.sentry.io/',
  silent: true,
  widenClientFileUpload: true,
  // Don't fail the build if Sentry source-map upload errors.
  errorHandler: () => {},
});
