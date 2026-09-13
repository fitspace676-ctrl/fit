import { extractGymSlug } from '@fit/utils';

/**
 * The gym a console sign-in on `host` should bind to: the tenant label of
 * `<slug>.<rootDomain>`, or `undefined` when the host names no tenant.
 *
 * It used to be the host's first label, whatever the host was — so a sign-in on
 * the console's own `fit-admin-….vercel.app` deployment asked the API for a gym
 * called `fit-admin-…`, and `app.<root>` for one called `app`. Reading the host
 * against the configured root domain, with the platform's reserved labels, is
 * what the member site's sign-in already does (`apps/web/lib/auth.ts`).
 */
export function loginGymSlug(host: string, rootDomain: string | undefined): string | undefined {
  return extractGymSlug(host, rootDomain) ?? undefined;
}
