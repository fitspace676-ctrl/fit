import { Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common';
import { Role } from '@fit/db';
import type { NextFunction, Request, Response } from 'express';
import { TokenService } from '../../auth/token.service';
import { tenantStorage, type TenantState } from './tenant.context';

/** The authenticated identity the middleware attaches to the request. */
export interface RequestUser {
  userId: string;
  role: Role;
  gymId: string | null;
}

/** Express request augmented with the resolved auth + tenant identity. */
export type RequestWithUser = Request & { user?: RequestUser };

/** Narrow an arbitrary string to a known {@link Role}, or `undefined`. */
function parseRole(value: unknown): Role | undefined {
  if (typeof value === 'string' && (Object.values(Role) as string[]).includes(value)) {
    return value as Role;
  }
  return undefined;
}

/**
 * Establishes the per-request tenant context for protected routes.
 *
 * Reads the `Authorization: Bearer <jwt>` access token, verifies it
 * ({@link TokenService.verifyAccessToken}), and derives the caller's identity —
 * `userId` from `sub`, `role` from the `role` claim (defaulting to `MEMBER`),
 * and the tenant from the `gymId` claim (with the CLI's `gym` slug accepted as
 * an alias). It then opens an {@link tenantStorage} store for the rest of the
 * request so the Prisma tenant extension and {@link TenantGuard} can scope every
 * query to that gym.
 *
 * Registered in `AppModule` for all routes except the public ones
 * (`/auth/*`, `/health`, `/uploads`), so it is transparent to existing
 * controllers and only gates routes that actually need a tenant.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  use(req: RequestWithUser, _res: Response, next: NextFunction): void {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Throws a 401 on any verification failure — propagated to the exception filter.
    const claims = this.tokens.verifyAccessToken(token);

    const role = parseRole(claims.role) ?? Role.MEMBER;
    const rawGym = claims.gymId ?? claims.gym;
    const gymId = typeof rawGym === 'string' && rawGym.length > 0 ? rawGym : null;

    const user: RequestUser = { userId: claims.sub, role, gymId };
    req.user = user;

    const state: TenantState = { userId: user.userId, gymId, role, allowCrossTenant: false };
    // Run the remainder of the request inside the ALS store so guards, handlers,
    // and the Prisma extension all observe this tenant. Wrapping `next()` keeps
    // the store active across the whole async continuation.
    tenantStorage.run(state, () => next());
  }
}

/** Extract the bearer token from an `Authorization` header value, if present. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return null;
  }
  return value.trim() || null;
}
