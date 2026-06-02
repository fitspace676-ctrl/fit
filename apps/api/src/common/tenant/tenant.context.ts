import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Role } from '@fit/db';

/**
 * The per-request tenant identity established by {@link TenantMiddleware} and
 * read by the Prisma tenant extension + {@link TenantGuard}.
 *
 * `gymId` is the tenant every scoped query is constrained to. It is `null` only
 * for a cross-tenant request — a `SUPER_ADMIN` hitting an `@AllowCrossTenant()`
 * route — where `allowCrossTenant` is flipped on by the guard so the extension
 * knows to skip scoping rather than fail closed on the missing gym.
 */
export interface TenantState {
  /**
   * The authenticated user id (JWT `sub`), or `null` for an unauthenticated
   * request whose tenant was established from the subdomain rather than a
   * session (see `SubdomainTenantMiddleware`).
   */
  userId: string | null;
  /** Tenant the request is scoped to; `null` only on a cross-tenant request. */
  gymId: string | null;
  /** The caller's role, used to gate the cross-tenant bypass. */
  role: Role;
  /**
   * Set true by {@link TenantGuard} when the handler is `@AllowCrossTenant()`
   * **and** the caller is `SUPER_ADMIN`. The Prisma extension reads this to
   * decide whether to skip the automatic `gymId` filter.
   */
  allowCrossTenant: boolean;
}

/**
 * Request-scoped tenant state, carried via {@link AsyncLocalStorage} rather than
 * a Nest request-scoped provider.
 *
 * Why ALS: the Prisma client is a process-wide singleton (see `@fit/db`), and a
 * single `$extends`-wrapped client serves every request. A request-scoped
 * provider can't reach into that singleton, so the extension reads the current
 * request's tenant from this store instead. {@link TenantMiddleware} opens a
 * store per request with `tenantStorage.run(...)`; everything downstream
 * (guards, handlers, the Prisma extension) sees it through the async context.
 */
export const tenantStorage = new AsyncLocalStorage<TenantState>();

/**
 * Injectable accessor over {@link tenantStorage}. Feature code depends on this
 * instead of touching the ALS store directly, keeping the storage mechanism an
 * implementation detail and the access point easy to mock in unit tests.
 */
@Injectable()
export class TenantContext {
  /** The active tenant state, or `undefined` outside a tenant-scoped request. */
  get current(): TenantState | undefined {
    return tenantStorage.getStore();
  }

  /**
   * The tenant id for the current request. Throws when there is no tenant in
   * scope (a coding error: a tenant-scoped handler ran without the middleware)
   * or when the request is cross-tenant and therefore has no single gym.
   */
  get gymId(): string {
    const state = this.current;
    if (!state || state.gymId === null) {
      throw new InternalServerErrorException('No tenant in scope for this request');
    }
    return state.gymId;
  }

  /**
   * The authenticated user id for the current request. `undefined` when there is
   * no tenant in scope, and `null` when the request is tenant-scoped but
   * unauthenticated (subdomain-resolved).
   */
  get userId(): string | null | undefined {
    return this.current?.userId;
  }

  /** The caller's role for the current request, or `undefined`. */
  get role(): Role | undefined {
    return this.current?.role;
  }
}
