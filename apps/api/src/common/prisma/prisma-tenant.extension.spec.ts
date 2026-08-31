import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@fit/db';
import { scopeArgs, tenantExtension, TENANT_SCOPED_MODELS } from './prisma-tenant.extension';
import { tenantStorage, type TenantState } from '../tenant/tenant.context';

function state(overrides: Partial<TenantState> = {}): TenantState {
  return {
    userId: 'u-1',
    gymId: 'gym-a',
    role: Role.MEMBER,
    allowCrossTenant: false,
    ...overrides,
  };
}

describe('scopeArgs', () => {
  it('leaves a non-tenant-scoped model untouched', () => {
    const args = { where: { email: 'x@y.z' } };
    expect(scopeArgs('User', 'findFirst', args, state())).toBe(args);
  });

  it('appends gymId to the where of a scoped read', () => {
    const result = scopeArgs('GymMember', 'findMany', { where: { role: Role.TRAINER } }, state());
    expect(result).toEqual({ where: { role: Role.TRAINER, gymId: 'gym-a' } });
  });

  it('scopes AuditLog too — it carries a gymId', () => {
    expect(scopeArgs('AuditLog', 'findMany', { where: { action: 'x' } }, state())).toEqual({
      where: { action: 'x', gymId: 'gym-a' },
    });
    expect(scopeArgs('AuditLog', 'create', { data: { action: 'x' } }, state())).toEqual({
      data: { action: 'x', gymId: 'gym-a' },
    });
  });

  it('scopes the financial children the reports read directly — Refund and PromoRedemption', () => {
    // Both carry their own `gymId` (duplicated from the parent order / promo code
    // precisely so they can be queried without a join), and both are now read
    // directly by the reports rather than only through a scoped parent.
    expect(
      scopeArgs('Refund', 'findMany', { where: { createdAt: { gte: new Date(0) } } }, state()),
    ).toMatchObject({ where: { gymId: 'gym-a' } });
    expect(
      scopeArgs('PromoRedemption', 'findMany', { where: { promoCodeId: 'p-1' } }, state()),
    ).toMatchObject({ where: { gymId: 'gym-a' } });
  });

  it('does NOT scope OrderItem — it has no gymId of its own', () => {
    // An order line is reached only through its already-scoped `Order`. Adding it
    // to the scoped set would inject a filter on a column the table does not have,
    // and every line query in the app would fail.
    const args = { where: { orderId: 'o-1' } };
    expect(scopeArgs('OrderItem', 'findMany', args, state())).toBe(args);
    expect(TENANT_SCOPED_MODELS.has('OrderItem')).toBe(false);
  });

  it('appends gymId even when the read has no where at all', () => {
    expect(scopeArgs('GymMember', 'findMany', undefined, state())).toEqual({
      where: { gymId: 'gym-a' },
    });
  });

  it('OVERWRITES a caller-supplied foreign gymId so another tenant is unreachable', () => {
    // The attacker tries to read gym B's rows while scoped to gym A.
    const result = scopeArgs('GymMember', 'findMany', { where: { gymId: 'gym-b' } }, state());
    expect(result).toEqual({ where: { gymId: 'gym-a' } });
  });

  it('stamps gymId onto created data', () => {
    expect(scopeArgs('GymMember', 'create', { data: { userId: 'u-2' } }, state())).toEqual({
      data: { userId: 'u-2', gymId: 'gym-a' },
    });
  });

  it('stamps gymId onto every row of a createMany', () => {
    const result = scopeArgs(
      'GymMember',
      'createMany',
      { data: [{ userId: 'a' }, { userId: 'b' }] },
      state(),
    );
    expect(result).toEqual({
      data: [
        { userId: 'a', gymId: 'gym-a' },
        { userId: 'b', gymId: 'gym-a' },
      ],
    });
  });

  it('constrains the where of update / delete to the tenant', () => {
    expect(scopeArgs('GymMember', 'delete', { where: { id: 'gm-1' } }, state())).toEqual({
      where: { id: 'gm-1', gymId: 'gym-a' },
    });
  });

  it('throws (fail-closed) when a scoped model is queried with no tenant in scope', () => {
    expect(() => scopeArgs('GymMember', 'findMany', {}, undefined)).toThrow(ForbiddenException);
  });

  it('throws when the request has a null gym and is not cross-tenant', () => {
    expect(() => scopeArgs('GymMember', 'findMany', {}, state({ gymId: null }))).toThrow(
      ForbiddenException,
    );
  });

  describe('cross-tenant bypass', () => {
    it('skips scoping for a SUPER_ADMIN on an allow-cross-tenant request', () => {
      const args = { where: {} };
      const result = scopeArgs(
        'GymMember',
        'findMany',
        args,
        state({ role: Role.SUPER_ADMIN, allowCrossTenant: true, gymId: null }),
      );
      expect(result).toBe(args);
    });

    it('does NOT skip scoping when allowCrossTenant is set but the role is not SUPER_ADMIN', () => {
      // A non-SuperAdmin can never bypass, even with the flag flipped — defence in depth.
      const result = scopeArgs(
        'GymMember',
        'findMany',
        {},
        state({ role: Role.OWNER, allowCrossTenant: true }),
      );
      expect(result).toEqual({ where: { gymId: 'gym-a' } });
    });
  });
});

describe('tenantExtension (load-bearing isolation)', () => {
  // An in-memory GymMember table spanning two tenants.
  const rows = [
    { id: 'gm-a1', gymId: 'gym-a', userId: 'u-a' },
    { id: 'gm-a2', gymId: 'gym-a', userId: 'u-a2' },
    { id: 'gm-b1', gymId: 'gym-b', userId: 'u-b' },
  ];

  /** Mimic Prisma's engine: return the rows matching a (possibly absent) gymId filter. */
  function fakeFindMany(args: { where?: { gymId?: string } }): typeof rows {
    const wanted = args.where?.gymId;
    return wanted ? rows.filter((r) => r.gymId === wanted) : rows;
  }

  /**
   * Run a `gymMember.findMany({})` the way the extension's `$allOperations` hook
   * does — scopeArgs then the underlying query — within gym A's request context.
   * `withExtension:false` simulates the extension having been removed.
   */
  function findMembers(withExtension: boolean, ctx: TenantState): typeof rows {
    return tenantStorage.run(ctx, () => {
      const callerArgs = {};
      const finalArgs = withExtension
        ? (scopeArgs('GymMember', 'findMany', callerArgs, tenantStorage.getStore()) as {
            where?: { gymId?: string };
          })
        : callerArgs;
      return fakeFindMany(finalArgs);
    });
  }

  it('a gym-A member sees only gym-A rows — never gym-B', () => {
    const visible = findMembers(true, state({ gymId: 'gym-a' }));
    expect(visible.map((r) => r.id)).toEqual(['gm-a1', 'gm-a2']);
    expect(visible.some((r) => r.gymId === 'gym-b')).toBe(false);
  });

  it('FAILS without the extension — the same query leaks gym-B rows (proves it is load-bearing)', () => {
    const leaked = findMembers(false, state({ gymId: 'gym-a' }));
    // Removing the extension lets gym B's row through: this is the regression the
    // extension exists to prevent, asserted so the build breaks if it is dropped.
    expect(leaked.some((r) => r.gymId === 'gym-b')).toBe(true);
  });

  it('exposes a Prisma extension factory and a documented scoped-model set', () => {
    // Prisma's defineExtension returns an extension callback.
    expect(tenantExtension()).toBeDefined();
    expect(TENANT_SCOPED_MODELS.has('GymMember')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(false);
    // Review carries a gymId (T5.12) and must be scoped so a manager can never
    // moderate — nor a member duplicate-check against — another gym's reviews.
    expect(TENANT_SCOPED_MODELS.has('Review')).toBe(true);
    // Order + Payment carry a gymId (T7.1) and must be scoped so the POS sale
    // persistence and the end-of-day reconciliation (T7.5) can never read or
    // write another gym's takings.
    expect(TENANT_SCOPED_MODELS.has('Order')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Payment')).toBe(true);
    // SubscriptionPlan + Subscription carry a gymId (T8.1) and must be scoped so
    // enrolment (T5.3), the plan CRUD (T8.2), and the analytics/dashboard rollups
    // can never read or write another gym's plans or memberships.
    expect(TENANT_SCOPED_MODELS.has('SubscriptionPlan')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Subscription')).toBe(true);
    // The CRM models carry a gymId (T12.2) and must be scoped so one gym's
    // sales pipeline — leads, upsell opportunities, and their timelines — is
    // never readable or writable from another gym's console.
    expect(TENANT_SCOPED_MODELS.has('Lead')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Opportunity')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('CrmActivity')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('CrmTask')).toBe(true);

    // The marketing surface — campaigns, promo codes, audience segments, and
    // message templates (T12.7) — is likewise isolated per gym.
    expect(TENANT_SCOPED_MODELS.has('Campaign')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('PromoCode')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('AudienceSegment')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('MessageTemplate')).toBe(true);
  });
});

/**
 * The 2026-08-30 audit: every model carrying a `gymId` scalar in
 * `packages/db/prisma/schema.prisma` measured against the allowlist. Thirteen
 * were missing; twelve were added. These cases pin each one so a future rename
 * or a revert is a failing test rather than a silent cross-tenant read.
 */
describe('the models the 2026-08-30 schema audit found missing', () => {
  /**
   * The twelve, with the query each was actually leaking through — so a failure
   * here names the surface that regressed rather than just a model string.
   */
  const ADDED: ReadonlyArray<readonly [model: string, leakedThrough: string]> = [
    ['CheckIn', 'reports memberCheckInLog / attendance drilldown / activity feed'],
    ['CreditPack', 'credit-packs chargeSeatCredit — picked a pack by memberId alone'],
    ['PtSession', 'reports trainer-utilisation + PT-hours — filtered on the window alone'],
    ['ClassType', 'the class-type CRUD and the scheduler lookups'],
    ['Cart', 'served off the unscoped client today; scoped for the first handler that is not'],
    ['Notification', 'the member inbox'],
    ['NotificationPreference', 'the per-category mute settings'],
    ['MemberGoal', 'me-goals listMyGoals — filtered on memberId alone'],
    ['MemberNote', 'the member detail timeline'],
    ['MemberTask', 'the member detail follow-ups'],
    ['StockMovement', 'the stock ledger'],
    ['DashboardWidget', 'no reader yet — listed so the first one is born isolated'],
  ] as const;

  it.each(ADDED)('scopes %s (was leaking via: %s)', (model) => {
    expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
  });

  it.each(ADDED)('constrains a bare %s read to the tenant', (model) => {
    // The shape the leaking queries had: a filter that names everything except
    // the gym. Each must come back with `gymId` welded on.
    expect(
      scopeArgs(model, 'findMany', { where: { createdAt: { gte: new Date(0) } } }, state()),
    ).toEqual({ where: { createdAt: { gte: new Date(0) }, gymId: 'gym-a' } });
  });

  it.each(ADDED)('OVERWRITES a foreign gymId on a %s read', (model) => {
    expect(scopeArgs(model, 'findMany', { where: { gymId: 'gym-b' } }, state())).toEqual({
      where: { gymId: 'gym-a' },
    });
  });

  it.each(ADDED)('fails closed on %s when there is no tenant in scope', (model) => {
    // The behaviour change these additions bought, and the one that could bite an
    // out-of-request caller: a timer tick or a webhook has no ALS store, so a
    // newly scoped model now throws instead of quietly reading every gym.
    expect(() => scopeArgs(model, 'findMany', {}, undefined)).toThrow(ForbiddenException);
  });

  it('leaves the hand-pinned gymId of the existing callers with the same value', () => {
    // `reports.service.ts`'s check-in log, the attendance drilldown, the activity
    // feed and the ops digest all pass `gymId` themselves. Those pins are now
    // redundant, not wrong — the extension overwrites them with the value they
    // already held — so they were left in place rather than mass-refactored.
    expect(
      scopeArgs('CheckIn', 'findMany', { where: { gymId: 'gym-a', method: 'QR' } }, state()),
    ).toEqual({ where: { gymId: 'gym-a', method: 'QR' } });
  });

  it('stamps gymId onto a CheckIn create and every row of a MemberGoal createMany', () => {
    // The two write shapes among the additions: a single create (reception
    // records an arrival) and a bulk one (the portal replaces a goal set).
    expect(scopeArgs('CheckIn', 'create', { data: { gymMemberId: 'gm-1' } }, state())).toEqual({
      data: { gymMemberId: 'gm-1', gymId: 'gym-a' },
    });
    expect(
      scopeArgs('MemberGoal', 'createMany', { data: [{ label: 'a' }, { label: 'b' }] }, state()),
    ).toEqual({
      data: [
        { label: 'a', gymId: 'gym-a' },
        { label: 'b', gymId: 'gym-a' },
      ],
    });
  });

  it('constrains an update keyed on the primary key — the class-type / member-task shape', () => {
    // `update({ where: { id } })` gains a non-unique filter. Valid input under
    // Prisma 6's extended `whereUnique`, and the same shape the already-scoped
    // models have used since the set existed.
    // Only the `where` is touched — `update` short-circuits on the where-writes
    // branch, so the caller's `data` is passed through exactly as written.
    expect(
      scopeArgs('ClassType', 'update', { where: { id: 'ct-1' }, data: { name: 'HIIT' } }, state()),
    ).toEqual({ where: { id: 'ct-1', gymId: 'gym-a' }, data: { name: 'HIIT' } });
  });

  it('does NOT scope AgentChatSession — its upsert guard needs the cross-gym probe', () => {
    // The thirteenth. Its `id` is minted by the admin client (a short string, not
    // a uuid) and is the bare primary key, so ids can collide across gyms.
    // `AgentSessionsService.upsert` probes `findUnique({ where: { id } })` ACROSS
    // gyms to answer 404 rather than overwrite another tenant's row; scoping the
    // model turns that probe into a within-gym miss, and the upsert behind it
    // then falls through to a create that dies on the primary key — a 500 where a
    // 404 used to be. Nothing leaks in exchange: every other query in that
    // service already pins `gymId` AND `userId`, and the probe returns no row
    // data. Listing it requires that service to change in the same commit.
    expect(TENANT_SCOPED_MODELS.has('AgentChatSession')).toBe(false);
    const probe = { where: { id: 's-abc-123' } };
    expect(scopeArgs('AgentChatSession', 'findUnique', probe, state())).toBe(probe);
  });

  it('scopes findUnique through the catch-all branch, not the read list', () => {
    // Worth pinning because it is easy to misread: `findUnique` is in neither
    // SCOPED_READS nor SCOPED_WHERE_WRITES, and picks up `gymId` from the
    // fall-through at the end of scopeArgs. That is what would have rewritten
    // AgentChatSession's ownership probe above.
    expect(scopeArgs('CheckIn', 'findUnique', { where: { id: 'c-1' } }, state())).toEqual({
      where: { id: 'c-1', gymId: 'gym-a' },
    });
  });
});

/**
 * The change's real risk was not the models — it was the callers that run with no
 * request, and therefore no `tenantStorage` store, where a newly scoped model
 * throws instead of reading. This pins the accommodation each one relies on.
 */
describe('out-of-request callers of the newly scoped models', () => {
  it('a cron tick has no store, so the scoped client would throw — which is why the jobs use the unscoped one', () => {
    // `ops-notifications.service.ts`'s daily summary counts check-ins on a timer.
    // It takes the base PrismaService and passes `gymId` explicitly. This asserts
    // what WOULD have happened had it been on the scoped client, so the reason
    // those jobs are written that way stays visible.
    expect(() =>
      scopeArgs('CheckIn', 'count', { where: { gymId: 'gym-a' } }, tenantStorage.getStore()),
    ).toThrow(ForbiddenException);
  });

  it('the weekly/monthly report digest works because it opens its own store per gym', () => {
    // `report-delivery.service.ts` is the one job that drives a tenant-scoped
    // service (ReportsService, which reads `checkIn` and `ptSession`) off a
    // timer. It wraps each gym's digest in `tenantStorage.run(...)` exactly so
    // the extension has a tenant to find — which is now load-bearing for two
    // models it was not load-bearing for before.
    const digestStore: TenantState = {
      userId: null,
      gymId: 'gym-a',
      role: Role.OWNER,
      allowCrossTenant: false,
    };
    const scoped = tenantStorage.run(digestStore, () =>
      scopeArgs('PtSession', 'findMany', { where: {} }, tenantStorage.getStore()),
    );
    expect(scoped).toEqual({ where: { gymId: 'gym-a' } });
  });

  it('a SUPER_ADMIN on an @AllowCrossTenant route still bypasses the new models', () => {
    const args = { where: {} };
    expect(
      scopeArgs(
        'CheckIn',
        'findMany',
        args,
        state({ role: Role.SUPER_ADMIN, allowCrossTenant: true, gymId: null }),
      ),
    ).toBe(args);
  });
});
