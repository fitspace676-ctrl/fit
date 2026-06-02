import { headers } from 'next/headers';
import { extractGymSlug } from '@fit/utils';
import { env } from './env';

/**
 * The gym slug the current request is served under (`<slug>.<root>`), resolved
 * from the request `Host` against `NEXT_PUBLIC_ROOT_DOMAIN`. Returns `null` on
 * the apex domain or a `.vercel.app` preview URL, where the member site renders
 * generically with no tenant in scope.
 *
 * Server-only (reads `next/headers`); call it from Server Components, layouts,
 * or route handlers to brand/scope the page to the active tenant. `x-forwarded-host`
 * wins over `host` so it reflects the public hostname behind Vercel's proxy.
 */
export async function getActiveGymSlug(): Promise<string | null> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return extractGymSlug(host, env.NEXT_PUBLIC_ROOT_DOMAIN);
}
