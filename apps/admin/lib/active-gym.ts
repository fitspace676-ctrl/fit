import { headers } from 'next/headers';
import { extractGymSlug } from '@fit/utils';
import { env } from './env';

/**
 * The gym slug the current request is served under (`<slug>.<root>/admin`),
 * resolved from the request `Host` against `NEXT_PUBLIC_ROOT_DOMAIN`. Returns
 * `null` on the apex domain or a `.vercel.app` preview URL.
 *
 * Server-only (reads `next/headers`); call it from Server Components or layouts
 * to scope the staff console to the active tenant. The session cookie (shared
 * across subdomains) already pins the API request's gym via its JWT claim — this
 * is for the console's own UI (which gym am I managing). `x-forwarded-host` wins
 * over `host` so it reflects the public hostname behind Vercel's proxy.
 */
export async function getActiveGymSlug(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return extractGymSlug(host, env.NEXT_PUBLIC_ROOT_DOMAIN);
}
