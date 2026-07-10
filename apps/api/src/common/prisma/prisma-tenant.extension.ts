import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@fit/db';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';

/**
 * Models that carry a `gymId` scalar and must be tenant-scoped. The extension
 * leaves every other model untouched, so cross-tenant entities (`User`,
 * `RefreshToken`) and the tenant root (`Gym`, keyed by `id`) keep working
 * unscoped. Add a model here the moment it gains a `gymId` column.
 *
 * `AuditLog` carries a `gymId` and is listed so any *scoped*-client access is
 * auto-constrained to the caller's gym. The SuperAdmin console writes/reads it
 * cross-tenant through the unscoped {@link PrismaService} (deliberately, with an
 * explicit `gymId`), which this set does not touch — but the moment a gym-scoped
 * handler reaches for `auditLog`, isolation is already enforced rather than
 * silently absent.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set<string>([
  'GymMember',
  'Trainer',
  'Location',
  'Product',
  'PackagePlan',
  'StaffInvite',
  'AuditLog',
  'ClassTemplate',
  'ClassInstance',
  'Booking',
  'Review',
  'Order',
  'Payment',
  'SubscriptionPlan',
  'Subscription',
  'Invoice',
  'InvoiceSequence',
  'Lead',
  'Opportunity',
  'CrmActivity',
  'CrmTask',
  'AutomationRule',
  'AutomationRun',
  'Campaign',
  'PromoCode',
  'AudienceSegment',
  'MessageTemplate',
  'LoyaltyProgram',
  'LoyaltyLedgerEntry',
  'LoyaltyReward',
  'LoyaltyRedemption',
  'StaffNote',
  'StaffTask',
  'TimeOffRequest',
  'StaffSpecialty',
  'ShiftSlot',
]);

/** Read operations whose `where` is constrained to the current tenant. */
const SCOPED_READS: ReadonlySet<string> = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/** Mutations whose `where` is constrained to the current tenant. */
const SCOPED_WHERE_WRITES: ReadonlySet<string> = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/** Mutations whose created `data` is stamped with the current tenant. */
const SCOPED_DATA_WRITES: ReadonlySet<string> = new Set(['create', 'createMany']);

/** Loose view of a Prisma operation's args — the extension only touches `where` / `data`. */
type AnyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  [key: string]: unknown;
};

/**
 * True when the request may bypass tenant scoping: an `@AllowCrossTenant()`
 * handler reached by a `SUPER_ADMIN`. Both conditions are required — the
 * decorator alone never disables isolation.
 */
function isCrossTenant(state: TenantState | undefined): boolean {
  return Boolean(state?.allowCrossTenant) && state?.role === Role.SUPER_ADMIN;
}

/**
 * Rewrite a Prisma operation's args to constrain it to the current tenant.
 *
 * Pure and framework-free so it can be unit-tested without a database — the
 * `$extends` wrapper in {@link tenantExtension} simply feeds it the live
 * operation and the ALS tenant state. `gymId` is **overwritten**, never merely
 * merged: a caller that passes `where: { gymId: otherGym }` has it replaced with
 * the request's own gym, so another tenant's rows are unreachable by
 * construction rather than by the handler remembering to filter.
 *
 * Fails closed: a scoped model touched with no tenant in scope (or a non-cross
 * request whose gym is somehow null) throws rather than running unscoped.
 */
export function scopeArgs(
  model: string | undefined,
  operation: string,
  args: unknown,
  state: TenantState | undefined,
): unknown {
  // Not a tenant-scoped model → leave the query exactly as written.
  if (!model || !TENANT_SCOPED_MODELS.has(model)) {
    return args;
  }

  // SuperAdmin on an @AllowCrossTenant route → intentional cross-gym access.
  if (isCrossTenant(state)) {
    return args;
  }

  if (!state || state.gymId === null) {
    throw new ForbiddenException({
      message: 'Tenant scope is required for this operation',
      code: 'TENANT_CONTEXT_MISSING',
    });
  }
  const gymId = state.gymId;

  const next: AnyArgs = { ...((args as AnyArgs | undefined) ?? {}) };

  if (SCOPED_READS.has(operation) || SCOPED_WHERE_WRITES.has(operation)) {
    next.where = { ...(next.where ?? {}), gymId };
    return next;
  }

  if (SCOPED_DATA_WRITES.has(operation)) {
    if (Array.isArray(next.data)) {
      next.data = next.data.map((row) => ({ ...row, gymId }));
    } else {
      next.data = { ...(next.data ?? {}), gymId };
    }
    return next;
  }

  // upsert and any other op we don't explicitly model: scope every part that
  // exists (where for the match, data/create/update for the payload) so it
  // still can't escape the tenant, then run it.
  if (next.where) {
    next.where = { ...next.where, gymId };
  }
  if (next.data && !Array.isArray(next.data)) {
    next.data = { ...next.data, gymId };
  }
  const withCreateUpdate = next as AnyArgs & {
    create?: Record<string, unknown>;
    update?: Record<string, unknown>;
  };
  if (withCreateUpdate.create) {
    withCreateUpdate.create = { ...withCreateUpdate.create, gymId };
  }
  if (withCreateUpdate.update) {
    withCreateUpdate.update = { ...withCreateUpdate.update, gymId };
  }
  return next;
}

/**
 * Prisma client extension that auto-applies tenant scoping to every operation
 * on a {@link TENANT_SCOPED_MODELS tenant-scoped model}, reading the active
 * tenant from {@link tenantStorage}. Wrap the shared client once
 * (`prisma.$extends(tenantExtension())`) and hand the result to request
 * handlers — see `TenantPrismaService`.
 *
 * This extension is **load-bearing**: remove it and the same handler reads
 * across tenants. The cross-tenant isolation tests assert exactly that.
 */
export function tenantExtension() {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const scoped = scopeArgs(model, operation, args, tenantStorage.getStore());
          return query(scoped as typeof args);
        },
      },
    },
  });
}
