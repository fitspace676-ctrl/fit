import { ForbiddenException } from '@nestjs/common';
import { TENANT_MISMATCH_CODE } from '@fit/types';
import type { VerifiedAccessClaims } from '../../auth/token.service';
import { env } from '../../config/env';
import { resolveTenantSlug, type TenantHeaders } from '../middleware/subdomain-tenant.middleware';

/**
 * Refuse an authenticated request whose session belongs to a different gym than
 * the tenant host it arrived on — `403 TENANT_MISMATCH`.
 *
 * The session's scope still comes from the JWT alone; this only stops a session
 * minted on `downtown.<root>` being *used* on `riverside.<root>`, where the page
 * would show one gym's chrome over another gym's data. It runs only when both
 * sides have an opinion:
 *
 * - no tenant host (the API's own host, `app.<root>`, `localhost`, a mobile
 *   client) → nothing to compare against;
 * - no `gymSlug` claim (a SUPER_ADMIN or other platform session, a CLI token, or
 *   a token issued before the claim existed) → nothing to compare with.
 *
 * Impersonation tokens carry the impersonated gym's slug, so they pass on that
 * gym's host like any other session.
 */
export function assertSessionMatchesTenantHost(
  headers: TenantHeaders,
  claims: Pick<VerifiedAccessClaims, 'gymSlug'>,
  rootDomain: string = env.PLATFORM_ROOT_DOMAIN,
): void {
  const sessionSlug =
    typeof claims.gymSlug === 'string' && claims.gymSlug.length > 0 ? claims.gymSlug : null;
  if (!sessionSlug) {
    return;
  }
  const hostSlug = resolveTenantSlug(headers, rootDomain);
  if (hostSlug && hostSlug !== sessionSlug.toLowerCase()) {
    throw new ForbiddenException({
      message: 'Session belongs to a different gym',
      code: TENANT_MISMATCH_CODE,
    });
  }
}
