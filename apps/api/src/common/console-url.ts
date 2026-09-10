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

/**
 * The same, for the member site: an absolute deep link for the CTA of a mail the
 * API sends a member (address verification, password reset). `path` is given
 * without a leading slash — `'member/verify'`, `'member/reset-password'`.
 *
 * Prefers the gym's own tenant host, so someone who signed up at Downtown gets
 * back a link to Downtown's site, branded as they left it, rather than to
 * whatever the platform-wide `WEB_URL` points at. Falls back to `WEB_URL` when
 * there is no slug in scope or no root domain configured, and to a localhost
 * default when even that is unset.
 *
 * Unlike {@link buildConsoleUrl} this always returns a string: a verification
 * mail without a link is not a degraded mail, it is a useless one, and the
 * localhost fallback is only ever reached in an unconfigured dev / CI build,
 * where the link is logged rather than sent.
 *
 * No base path is joined on — the member site is served at the root of its host.
 * Nor is a locale prefix: the web middleware adds `/<locale>` itself and keeps
 * the `?token=` query while doing so.
 */
export function buildMemberUrl(path: string, gymSlug?: string | null): string {
  const origin =
    tenantOrigin(gymSlug, env.PLATFORM_ROOT_DOMAIN) ??
    (env.WEB_URL ? env.WEB_URL.replace(/\/+$/, '') : 'http://localhost:3001');
  return `${origin}/${path}`;
}
