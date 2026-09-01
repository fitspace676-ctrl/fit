import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { TenantContext, type TenantState } from '../tenant/tenant.context';
import {
  REQUEST_ACCESS_RESOLVER,
  sharedRequestAccessResolver,
  type RequestAccess,
  type RequestAccessResolver,
} from './request-access';
import { Permission, SELF_SERVICE_PERMISSIONS } from '@fit/types';

/** {@link SELF_SERVICE_PERMISSIONS} as a set, for the branch-scope skip below. */
const SELF_SERVICE = new Set<Permission>(SELF_SERVICE_PERMISSIONS);

/**
 * The application's **global, deny-by-default** authorization gate. Registered
 * once via `APP_GUARD` (see `AppModule`), it runs on every route so that being
 * reachable is always a deliberate, declared decision — never an accidental
 * omission.
 *
 * A route is admitted only if it declares its authorization intent in one of
 * these ways:
 *
 * - `@Public()` — genuinely open (registration, login, health). Allowed
 *   outright, with no session required.
 * - `@RequirePermissions(...)` — the caller must hold *every* listed permission
 *   (AND semantics). The grant set is resolved **per gym, at request time**, from
 *   `Gym.settings.permissions` (see {@link RequestAccessResolver}); `SUPER_ADMIN`
 *   and `OWNER` hold every permission unconditionally. Any missing permission — or
 *   any failure to resolve the set at all — is a `403`.
 * - `@Roles(...)` — authorization is delegated to {@link RolesGuard}; this guard
 *   only confirms an authenticated session is present and lets the route through.
 * - `@AllowCrossTenant()` — a platform/SuperAdmin route whose authorization is
 *   enforced by {@link TenantGuard} (SUPER_ADMIN-only); likewise delegated.
 *
 * A route declaring **none** of the above is rejected with `403` — the
 * deny-by-default backstop. Any non-public route also requires an established
 * {@link TenantContext} (set by `TenantMiddleware`); its absence means the route
 * was wired without the middleware and surfaces as `401`.
 *
 * ## Branch scope
 *
 * A role configured `branchScope: 'assigned'` may only work at the branches its
 * holder has `LocationStaff` rows for. That is enforced here, on the same resolved
 * answer as the permission check — see {@link PermissionsGuard.enforceBranchScope}
 * for where it sits and why.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  // `Reflector` and `TenantContext` are stateless utilities — one reads route
  // metadata via reflect-metadata, the other an AsyncLocalStorage store — so they
  // default to fresh instances. This keeps the guard working even when Nest
  // resolves it as a global `APP_GUARD` (via `useExisting`) and passes `undefined`
  // for these constructor deps, which otherwise left `this.reflector` undefined
  // and 500'd EVERY request (incl. /health, /auth/login) — only in production, so
  // it passed CI/local while failing every Railway deploy's healthcheck.
  //
  // `access` follows the same shape for the same reason, but it may NOT be a fresh
  // stateless instance: the real resolver owns a cache and a database handle. Its
  // default is the process-wide holder `RolePermissionsService` publishes on
  // construction, so the guard reaches the real service whether or not this
  // parameter was injected — and, if nothing was ever registered, the holder
  // THROWS, which lands as a `403` rather than as a fallback to the static matrix.
  constructor(
    private readonly reflector: Reflector = new Reflector(),
    private readonly tenant: TenantContext = new TenantContext(),
    @Optional()
    @Inject(REQUEST_ACCESS_RESOLVER)
    private readonly access: RequestAccessResolver = sharedRequestAccessResolver(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    // A genuinely public route — no session needed, no further checks.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    // Every non-public route runs behind an authenticated tenant context. Its
    // absence means TenantMiddleware never ran for this route — a wiring error.
    const state = this.tenant.current;
    if (!state) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (requiredPermissions && requiredPermissions.length > 0) {
      const access = await this.resolveAccess(state);
      const hasAll = requiredPermissions.every((permission) =>
        access.grants.includes(permission),
      );
      if (!hasAll) {
        throw new ForbiddenException({
          message: 'You do not have permission to perform this action',
          code: 'INSUFFICIENT_PERMISSION',
        });
      }
      this.enforceBranchScope(context, access, requiredPermissions);
      return true;
    }

    // No permission requirement, but authorization may be declared via a sibling
    // gate — `@Roles(...)` (RolesGuard) or `@AllowCrossTenant()` (TenantGuard).
    // Defer to them; they run as controller-level guards on those routes.
    const hasRoles =
      (this.reflector.getAllAndOverride<unknown[]>(ROLES_KEY, targets) ?? []).length > 0;
    const allowsCrossTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CROSS_TENANT_KEY,
      targets,
    );
    if (hasRoles || allowsCrossTenant) {
      return true;
    }

    // Nothing declared any authorization intent — deny by default.
    throw new ForbiddenException({
      message: 'This endpoint declares no authorization policy',
      code: 'ENDPOINT_NOT_AUTHORIZED',
    });
  }

  /**
   * The caller's effective grants and branch scope — or a `403`.
   *
   * **Every failure denies.** A missing gym row, a database outage, a resolver that
   * was never registered: each one lands here and each one becomes
   * `PERMISSION_RESOLUTION_FAILED`. Falling back to `roleHasPermission` would be the
   * comfortable choice and it is the wrong one — it would restore, silently and
   * exactly when the system is degraded, every grant an operator has revoked. The
   * cause is logged at `error` so an outage reads as an outage in the logs rather
   * than as a flood of permission complaints from users.
   */
  private async resolveAccess(state: TenantState): Promise<RequestAccess> {
    try {
      return await this.access.resolve(state);
    } catch (error) {
      this.logger.error(
        `Could not resolve permissions for role ${state.role} at gym ${state.gymId ?? '<none>'}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ForbiddenException({
        message: 'Your permissions could not be verified',
        code: 'PERMISSION_RESOLUTION_FAILED',
      });
    }
  }

  /**
   * Hold an `assigned`-scope caller to the branches they are actually rostered at.
   *
   * ## Why here
   *
   * Branch scope is an authorization boundary, so it belongs in the layer that can
   * refuse the request — and it belongs in THIS guard specifically, for three
   * reasons:
   *
   *  1. **It runs before pipes.** Nest's order is middleware → guards → interceptors
   *     → pipes → handler, and every branch-aware controller reads `@Query()` and
   *     hands it to a Zod schema. Forcing a branch into `request.query` here means
   *     the handler's own validated query already carries it; nothing downstream has
   *     to know this happened.
   *  2. **It shares one resolution with the permission check.** Scope and grants
   *     come from the same role entry in the same settings blob. Splitting them
   *     across a guard and an interceptor would mean two resolutions per request
   *     that could disagree, and an authorization decision that is only half made
   *     when the guard returns `true`.
   *  3. **The alternative does not close the hole.** Putting it in the callers of
   *     `atLocation` would be opt-in across ~60 call sites in a dozen services, so
   *     the first read that forgets is a leak — and a filter every caller has to
   *     remember is the console-side filter again, one layer down. Here it is
   *     unconditional: `APP_GUARD` runs on every route, so a new branch-aware
   *     endpoint is covered the day it is written.
   *
   * ## What it does
   *
   * - **Gym-wide scope is untouched.** `all` returns immediately, so `OWNER`,
   *   `MANAGER`, `MEMBER` and `SUPER_ADMIN` pay nothing and behave exactly as before.
   * - **Self-service routes are untouched.** When every permission the route
   *   requires is one whose subject is the ACTOR — the member portal's own profile,
   *   subscription and invoices — there is no branch dimension to clamp, and
   *   clamping one would lock a branch-restricted trainer out of their own profile.
   * - **A named branch must be one the caller holds.** Checked on the query, the
   *   route params and the body, because a branch arrives by all three (a filtered
   *   roster, a branch-scoped path, a check-in that records where it happened). A
   *   `null` body value is left alone: on the catalogue models `null` means
   *   "available at every branch", which the write permission governs, not this.
   * - **A request that names none is FORCED onto one**, rather than being allowed
   *   to fall through to gym-wide. That is the difference between a filter and a
   *   boundary.
   * - **A caller rostered nowhere is refused outright.** The contract states it:
   *   "a role with `assigned` and no branch assignments sees nothing". Answering
   *   with empty lists everywhere instead would be indistinguishable from data loss.
   *
   * ## What it does not do
   *
   * It clamps the branch DIMENSION of a request; it does not make every resource
   * branch-aware. A handler that takes no branch at all — `GET /members/:id` — is
   * unaffected, because there is no branch on the request to check and the row's own
   * ownership is not something this layer can see. Narrowing per-record reads is a
   * per-resource job and is deliberately not attempted here.
   */
  private enforceBranchScope(
    context: ExecutionContext,
    access: RequestAccess,
    required: readonly Permission[],
  ): void {
    if (access.branchScope !== 'assigned') {
      return;
    }
    if (required.every((permission) => SELF_SERVICE.has(permission))) {
      return;
    }

    const allowedIds = access.allowedLocationIds ?? [];
    // The branch a request naming none is pinned to. Derived here rather than in
    // the `if` below so the "rostered nowhere" case is one check: no branches means
    // no branch to force, and forcing is not optional.
    const forced = access.defaultLocationId ?? allowedIds[0];
    if (allowedIds.length === 0 || forced === undefined) {
      throw new ForbiddenException({
        message: 'You are not assigned to any branch',
        code: 'BRANCH_SCOPE_UNASSIGNED',
      });
    }
    const allowed = new Set(allowedIds);

    const request = context.switchToHttp().getRequest<Request>();
    for (const requested of requestedLocationIds(request)) {
      if (!allowed.has(requested)) {
        throw new ForbiddenException({
          message: 'You do not have access to that branch',
          code: 'BRANCH_FORBIDDEN',
        });
      }
    }

    if (typeof request.query?.locationId !== 'string' || request.query.locationId.length === 0) {
      forceQueryLocation(request, forced);
    }
  }
}

/** Every branch id the request names, across the three places one can arrive. */
function requestedLocationIds(request: Request): string[] {
  const carriers: unknown[] = [
    request.query?.locationId,
    request.params?.locationId,
    (request.body as Record<string, unknown> | undefined)?.locationId,
  ];
  return carriers.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

/**
 * Pin `request.query.locationId` to `locationId` for the rest of the request.
 *
 * Defined as an OWN property rather than assigned, because Express 5 exposes
 * `req.query` as a getter with no setter that re-parses the query string on every
 * access — a plain assignment throws, and mutating the object it returns writes to
 * a value nobody reads again. An own data property shadows the prototype getter, so
 * `@Query()` (which reads `req.query`) sees the clamped value.
 */
function forceQueryLocation(request: Request, locationId: string): void {
  Object.defineProperty(request, 'query', {
    value: { ...(request.query ?? {}), locationId },
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
