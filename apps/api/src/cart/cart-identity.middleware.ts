import { Injectable, type NestMiddleware } from '@nestjs/common';
import { Role } from '@fit/db';
import type { NextFunction, Response } from 'express';
import { TokenService } from '../auth/token.service';
import { tenantStorage, type TenantState } from '../common/tenant/tenant.context';
import { extractBearerToken, type RequestWithUser } from '../common/tenant/tenant.middleware';

/** Narrow an arbitrary string to a known {@link Role}, or `undefined`. */
function parseRole(value: unknown): Role | undefined {
  if (typeof value === 'string' && (Object.values(Role) as string[]).includes(value)) {
    return value as Role;
  }
  return undefined;
}

/**
 * Optional-auth tenant establishment for the member-facing cart routes (T7.7).
 *
 * The cart is reachable both signed-in (a member, scoped by their JWT) and
 * anonymously (a guest on a gym subdomain, scoped by the host). It is therefore
 * excluded from the mandatory {@link TenantMiddleware} — which 401s a request
 * with no bearer token — and gated by this middleware instead:
 *
 * - **No bearer token** → pass through. The earlier
 *   {@link SubdomainTenantMiddleware} (which runs on every route) has already
 *   opened the tenant store from the `<slug>.fit.ge` host for the guest; a
 *   request with no resolvable tenant simply proceeds with none and the handler
 *   fails closed on its own.
 * - **A bearer token** → verify it (a malformed / expired token is a `401`,
 *   exactly like the JWT middleware) and open the same {@link tenantStorage}
 *   store the authenticated path uses, with the member's `userId` + gym. A
 *   session always wins over the host, mirroring `SubdomainTenantMiddleware`,
 *   which steps aside whenever an `Authorization` header is present.
 */
@Injectable()
export class CartIdentityMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  use(req: RequestWithUser, _res: Response, next: NextFunction): void {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      // Anonymous: the subdomain middleware already scoped (or left no) tenant.
      next();
      return;
    }

    // Throws a 401 on any verification failure — propagated to the exception filter.
    const claims = this.tokens.verifyAccessToken(token);
    const role = parseRole(claims.role) ?? Role.MEMBER;
    const rawGym = claims.gymId ?? claims.gym;
    const gymId = typeof rawGym === 'string' && rawGym.length > 0 ? rawGym : null;

    req.user = { userId: claims.sub, role, gymId };
    const state: TenantState = { userId: claims.sub, gymId, role, allowCrossTenant: false };
    tenantStorage.run(state, () => next());
  }
}
