import { tenantOrigin } from '@fit/utils';
import { env } from '../config/env';

/**
 * An absolute deep link into the staff console, for the CTA of a mail the API
 * sends (report digests, ops alerts, owner onboarding). `path` is given without a
 * leading slash — `'reports'`, `'products'`, `'dashboard'`, `'activate'`.
 *
 * Prefers the gym's own tenant host, `https://<slug>.<PLATFORM_ROOT_DOMAIN>`, so
 * the console opens already showing the gym the mail is about. The link is
 * addressed per gym because these are cross-tenant sweeps: one run mails every
 * active gym, and a single shared origin would land every owner on whichever gym
 * their last session happened to select. The API side is unaffected either way —
 * the session's JWT claim, not the host, decides what the console may read.
 *
 * Falls back to the platform-wide `ADMIN_URL` origin when there is no slug in
 * scope or no root domain configured, and returns `undefined` when neither is
 * set (the mail then simply renders no link).
 *
 * `ADMIN_BASE_PATH` — the prefix the console is served under — is joined on in
 * both cases, because neither origin carries it. Without it the link lands one
 * directory above every console route and 404s, the regression the owner
 * onboarding link first shipped with (see `buildOwnerOnboardingUrl`).
 */
export function buildConsoleUrl(path: string, gymSlug?: string | null): string | undefined {
  const origin =
    tenantOrigin(gymSlug, env.PLATFORM_ROOT_DOMAIN) ?? env.ADMIN_URL?.replace(/\/+$/, '');
  if (!origin) return undefined;
  return `${origin}${env.ADMIN_BASE_PATH}/${path}`;
}
