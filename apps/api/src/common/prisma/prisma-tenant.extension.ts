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
 *
 * ## 2026-08-30 — the allowlist was audited against the schema, and had drifted
 *
 * The instruction above ("add a model the moment it gains a `gymId`") had been
 * missed thirteen times. A diff of every `model` block carrying a `gymId` scalar
 * against this set found `CheckIn`, `CreditPack`, `PtSession`, `ClassType`,
 * `Cart`, `Notification`, `NotificationPreference`, `MemberGoal`, `MemberNote`,
 * `MemberTask`, `StockMovement`, `DashboardWidget` and `AgentChatSession` absent
 * — every one of them readable across tenants through the scoped client. Twelve
 * were added below; `AgentChatSession` was not, for the reason recorded at the
 * end of this block.
 *
 * Several of those thirteen were absent *on purpose*, and their services say so
 * in their own docblocks ("deliberately not in the tenant extension's auto-scope
 * set … so every query pins the tenant explicitly" — `CheckInService`,
 * `ActivityService`, `MeGoalsService`). Pinning `gymId` by hand is not wrong, but
 * it is not a substitute for this set: it holds only for as long as every future
 * query remembers, and three of them had already forgotten —
 * `reports.service.ts`'s two `ptSession.findMany` aggregates (trainer utilisation
 * and the PT-hours roll-up) filtered on the time window alone,
 * `me-goals.service.ts`'s `listMyGoals` filtered on `memberId` alone, and
 * `credit-packs.service.ts`'s `chargeSeatCredit` picked the pack to draw from by
 * `memberId` + status alone. That is the same shape of bug as the refund one
 * above, and the reason the belt is worn under the braces rather than instead.
 *
 * Adding a model here changes two things for its existing callers: a hand-pinned
 * `gymId` is now **overwritten** (harmless — it is overwritten with the value the
 * caller was already passing, so those pins are merely redundant now; they were
 * left in place rather than mass-deleted, since they also satisfy the create
 * inputs' static types), and a query with no tenant in scope now **throws**. The
 * second is the dangerous one, so every out-of-request path was checked:
 *
 * - Every `@Cron` job — booking reminders, the media sweep, subscription
 *   renewal, member purge, the ops digests, the automation scan — takes the
 *   unscoped {@link PrismaService} and passes `gymId` explicitly, exactly because
 *   there is no ALS store on a timer tick. `ops-notifications.service.ts`'s
 *   `checkIn.count` is the only cron query on a newly-scoped model, and it is on
 *   the unscoped client. Unaffected.
 * - `report-delivery.service.ts` is the one job that drives a *scoped* service
 *   (`ReportsService`) off a timer, and it already opens its own store with
 *   `tenantStorage.run({ gymId, … })` per gym before doing so. Its digests reach
 *   `checkIn` and `ptSession`; they keep working because that store exists.
 * - The cart runs on the unscoped {@link PrismaService} by design (it is served
 *   both signed-in and anonymously), so listing `Cart` here changes nothing
 *   today and guards the first handler that reaches for it off the scoped
 *   client — which, on a `/cart` route, has no `TenantMiddleware` and may have no
 *   store at all.
 * - The notification models are written by the cron digests and the dispatcher,
 *   all on the unscoped client with an explicit `gymId`/`userId`. Note that
 *   `NotificationService.alreadySent` keys on the `(userId, dedupeKey)` unique
 *   with no gym: it is correct only on the unscoped client, so do not "tidy" it
 *   onto the scoped one.
 * - `/webhooks/*` is excluded from `TenantMiddleware` and so has **no** tenant
 *   store. Today's bound provider is the stub, which touches no table, so nothing
 *   breaks — but a real gateway provider must use the unscoped client with the
 *   `gymId` from its verified payload. That hazard predates this change (`Order`,
 *   `Payment` and `Subscription` were already scoped) and is unchanged by it.
 * - Nothing in `main.ts`, the seed, or the SuperAdmin/`@AllowCrossTenant` paths
 *   reads any of the twelve; `DashboardWidget` has no reader anywhere at all and
 *   is listed purely so the first one inherits isolation.
 *
 * `AgentChatSession` is the one of the thirteen deliberately left out, and it is
 * the exception that has to stay documented or it will be "fixed" again. Its
 * `id` is minted by the admin *client* (a short string like `s-abc-123`, not a
 * uuid) and is the bare primary key, so ids can collide across gyms.
 * `AgentSessionsService.upsert` defends against that by probing
 * `findUnique({ where: { id } })` **across** gyms and answering `404` rather than
 * overwriting another tenant's row. Scoping the model turns that probe into a
 * within-gym lookup, which finds nothing, so the following `upsert` falls through
 * to a create and dies on the primary key — a `500` where the guard used to
 * return a clean `404`. There is no leak to trade for that: every other query in
 * the service already filters `gymId` **and** `userId` (its scoping is per-user,
 * which this set cannot express), and the probe returns no row data, only a
 * yes/no. Listing it needs `AgentSessionsService` changed in the same commit —
 * the probe re-expressed against the unscoped {@link PrismaService}, or the
 * upsert split into an explicit find-then-create/update — which is a change to a
 * service, not to this file.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set<string>([
  'GymMember',
  // The member's own record and the staff-authored detail hanging off it. The
  // goals are the member's to edit from the portal; the notes and tasks are the
  // gym's about them. All three are keyed on `memberId` by their callers, which
  // is only *incidentally* tenant-safe — a member id is unguessable, not scoped.
  'MemberGoal',
  'MemberNote',
  'MemberTask',
  'CheckIn',
  'Trainer',
  'Location',
  'Product',
  'ProductCategory',
  // What a product has on hand at one branch — the source of truth for inventory
  // since Stage 4 of multi-branch, with `Product.stock` demoted to its roll-up.
  // `gymId` is denormalised from the product precisely so it can be listed here:
  // an unlisted model carrying `gymId` is the cross-tenant leak shape this list
  // already had to be repaired for once, across 13 models.
  'ProductStock',
  // The stock ledger. Written from the POS sale, the refund restock, the manual
  // adjustment and the opening count — several of them inside a transaction the
  // scoped client opened, so the rows are stamped by the same `$transaction`.
  'StockMovement',
  'PackagePlan',
  'StaffInvite',
  'AuditLog',
  'ClassTemplate',
  'ClassType',
  'ClassInstance',
  'PtSession',
  'Booking',
  'Review',
  'Order',
  'Payment',
  // The shopper's basket. Reached signed-in or anonymously and served today off
  // the unscoped client with an explicit `gymId`; listed so it stays isolated if
  // it is ever read through the scoped one.
  'Cart',
  // Class credits: bought as a pack, drawn down one seat at a time inside the
  // booking transaction.
  'CreditPack',
  // The financial children of an order. Both duplicate `gymId` from their parent
  // so they can be aggregated without a join, and the reports do exactly that —
  // reading them directly rather than through the parent. Until they were listed
  // here that made them unscoped: `dashboard-sales.service.ts` summed refunds
  // across EVERY gym into one tenant's chart, because its `refund.findMany`
  // filtered on the window alone and nothing added the gym.
  //
  // `OrderItem` is deliberately NOT here: it carries no `gymId` of its own (see
  // its model doc), so scoping it would filter on a column that does not exist.
  // A line is reached through its already-scoped `Order`.
  'Refund',
  'PromoRedemption',
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
  // The member-facing inbox and its per-category mute settings. Produced by the
  // cron digests on the unscoped client (see the block above); listed for the
  // handlers that read them back.
  'Notification',
  'NotificationPreference',
  'LoyaltyProgram',
  'LoyaltyLedgerEntry',
  'LoyaltyReward',
  'LoyaltyRedemption',
  'StaffNote',
  'StaffTask',
  'TimeOffRequest',
  'ShiftSlot',
  'Service',
  'ServiceSession',
  // Which branches a staff member works at — the join table Stage 6 of
  // multi-branch introduced to replace `GymMember.assignedLocationIds`. It
  // denormalises `gymId` from both of its parents precisely so it can be listed
  // here: the roster filter reads it as a nested `some` under an already-scoped
  // `GymMember`, but the staff service also writes it DIRECTLY by `staffId`, and
  // an unlisted model carrying `gymId` is the exact leak shape this list had to
  // be repaired for across 13 models. Listing it means the assignment writer's
  // `deleteMany` cannot reach another tenant's rows even if a staff id ever
  // collided.
  'LocationStaff',
  // No reader anywhere yet — listed so the first one is born isolated rather
  // than joining the queue of models this audit had to catch up on.
  'DashboardWidget',
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
