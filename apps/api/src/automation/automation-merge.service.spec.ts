import { describe, expect, it, vi } from 'vitest';
import { AutomationMergeService } from './automation-merge.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AutomationBrand } from './automation-merge.service';

interface AnyArgs {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

/** A membership as `MEMBER_SELECT` projects it. */
function memberRow(over?: {
  name?: string | null;
  email?: string;
  phone?: string | null;
  subscriptions?: {
    currentPeriodEnd: Date;
    priceAmount: number;
    currency: string;
    plan: { name: string } | null;
  }[];
  checkIns?: number;
}) {
  return {
    id: 'gm-1',
    status: 'ACTIVE',
    joinedAt: new Date('2026-01-15T00:00:00.000Z'),
    dateOfBirth: new Date('1994-03-02T00:00:00.000Z'),
    user: {
      name: over?.name === undefined ? 'Nino Beridze' : over.name,
      email: over?.email ?? 'nino@example.com',
      phone: over?.phone === undefined ? '555' : over.phone,
    },
    subscriptions: over?.subscriptions ?? [
      {
        currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
        priceAmount: 12000,
        currency: 'GEL',
        plan: { name: 'Gold' },
      },
    ],
    _count: { checkIns: over?.checkIns ?? 37 },
  };
}

/** The gym-level facts `resolve` is handed, as the executor would supply them. */
const BRAND = {
  name: 'Iron Gym',
  business: {
    address: '12 Rustaveli Ave',
    phone: '+995 555 00 00 00',
    email: 'hello@irongym.ge',
    website: 'irongym.ge',
  },
  language: 'en',
  currency: 'GEL',
} as const satisfies AutomationBrand;

function setup(overrides?: {
  member?: unknown;
  subscription?: unknown;
  gym?: unknown;
  ledger?: { balanceAfter: number } | null;
}) {
  const memberFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.member === undefined ? memberRow() : overrides.member),
  );
  const ledgerFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.ledger === undefined ? { balanceAfter: 240 } : overrides.ledger),
  );
  const subscriptionFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(
      overrides?.subscription === undefined ? { memberId: 'gm-1' } : overrides.subscription,
    ),
  );
  const gymFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.gym === undefined ? { name: 'Iron Gym' } : overrides.gym),
  );

  const prisma = {
    client: {
      gymMember: { findFirst: memberFindFirst },
      subscription: { findFirst: subscriptionFindFirst },
      gym: { findFirst: gymFindFirst },
      loyaltyLedgerEntry: { findFirst: ledgerFindFirst },
    },
  } as unknown as PrismaService;

  return {
    service: new AutomationMergeService(prisma),
    memberFindFirst,
    subscriptionFindFirst,
    gymFindFirst,
    ledgerFindFirst,
  };
}

describe('AutomationMergeService.resolve', () => {
  it('resolves a member context to its address and tokens', async () => {
    const { service } = setup();

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.recipient).toBe('nino@example.com');
    expect(target?.values).toMatchObject({
      member_first_name: 'Nino',
      member_last_name: 'Beridze',
      member_plan_name: 'Gold',
      member_expiry_date: '2026-09-01',
      business_name: 'Iron Gym',
    });
  });

  // A body pasted from the marketing composer uses the bare tokens; both editors
  // must personalise the same way, so the aliases ride along.
  it('carries the bare marketing aliases alongside the member_* tokens', async () => {
    const { service } = setup();

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.values).toMatchObject({
      first_name: 'Nino',
      last_name: 'Beridze',
      email: 'nino@example.com',
      plan_name: 'Gold',
      expiry_date: '2026-09-01',
    });
  });

  it('resolves a subscription context through to its member', async () => {
    const { service, subscriptionFindFirst, memberFindFirst } = setup();

    const target = await service.resolve(
      'gym-1',
      { entityId: 'sub-9', entityType: 'subscription' },
      BRAND,
    );

    expect(subscriptionFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      id: 'sub-9',
      gymId: 'gym-1',
    });
    expect(memberFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gm-1', gymId: 'gym-1' });
    expect(target?.recipient).toBe('nino@example.com');
  });

  // The executor also runs from the tenant-less cron, so gymId is the only thing
  // standing between one gym's rule and another gym's member.
  it('constrains every lookup to the gym it was given', async () => {
    const { service, memberFindFirst } = setup({ member: null });

    const target = await service.resolve(
      'gym-other',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(memberFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-other' });
    expect(target).toBeNull();
  });

  it('returns null for a context it cannot personalise', async () => {
    const { service, memberFindFirst } = setup();

    expect(await service.resolve('gym-1', {}, BRAND)).toBeNull();
    expect(
      await service.resolve('gym-1', { entityId: 'x', entityType: 'invoice' }, BRAND),
    ).toBeNull();
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it('yields empty plan and expiry for a member holding no live subscription', async () => {
    const { service } = setup({ member: memberRow({ subscriptions: [] }) });

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.values.member_plan_name).toBe('');
    expect(target?.values.member_expiry_date).toBe('');
  });

  it('reports no recipient for a member with no address on file', async () => {
    const { service } = setup({ member: memberRow({ email: '' }) });

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.recipient).toBeNull();
  });

  // Phase B widened the catalogue; every chip the editor offers has to arrive as a
  // real value here, or it is decoration the member reads as a blank.
  it('fills the phase-B member tokens', async () => {
    const { service } = setup();

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.values).toMatchObject({
      member_full_name: 'Nino Beridze',
      member_status: 'ACTIVE',
      member_join_date: '2026-01-15',
      member_birthday: '1994-03-02',
      member_checkin_count: '37',
      member_points_balance: '240',
    });
  });

  it('fills the membership and business tokens', async () => {
    const { service } = setup();

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    // 12000 minor units of GEL, in the gym's own language.
    expect(target?.values.payment_amount).toContain('120');
    expect(target?.values).toMatchObject({
      payment_due_date: '2026-09-01',
      business_name: 'Iron Gym',
      business_phone: '+995 555 00 00 00',
      business_address: '12 Rustaveli Ave',
      business_email: 'hello@irongym.ge',
      business_website: 'irongym.ge',
    });
  });

  it('counts whole days to expiry, and never goes negative', async () => {
    const soon = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const sub = (currentPeriodEnd: Date) => [
      { currentPeriodEnd, priceAmount: 12000, currency: 'GEL', plan: { name: 'Gold' } },
    ];

    const ahead = setup({ member: memberRow({ subscriptions: sub(soon) }) });
    const lapsed = setup({ member: memberRow({ subscriptions: sub(past) }) });
    const ctx = { entityId: 'gm-1', entityType: 'member' };

    expect(
      (await ahead.service.resolve('gym-1', ctx, BRAND))?.values.member_days_until_expiry,
    ).toBe('3');
    expect(
      (await lapsed.service.resolve('gym-1', ctx, BRAND))?.values.member_days_until_expiry,
    ).toBe('0');
  });

  it('reports a zero points balance for a member with no ledger history', async () => {
    const { service } = setup({ ledger: null });

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.values.member_points_balance).toBe('0');
  });

  it('splits a single-word name into a first name and an empty surname', async () => {
    const { service } = setup({ member: memberRow({ name: 'Nino' }) });

    const target = await service.resolve(
      'gym-1',
      { entityId: 'gm-1', entityType: 'member' },
      BRAND,
    );

    expect(target?.values.member_first_name).toBe('Nino');
    expect(target?.values.member_last_name).toBe('');
  });
});

describe('AutomationMergeService.brand', () => {
  it('reads the gym name, contact details and locale', async () => {
    const { service, gymFindFirst } = setup();

    const brand = await service.brand('gym-1');

    expect(gymFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'gym-1' });
    expect(brand.name).toBe('Iron Gym');
    expect(brand.currency).toBe('GEL');
  });

  // A gym that never opened Settings still gets a personalised email — it just
  // loses the contact lines it never filled in.
  it('falls back to defaults when the gym row or its settings are missing', async () => {
    const { service } = setup({ gym: null });

    const brand = await service.brand('gym-1');

    expect(brand.name).toBe('');
    expect(brand.business.phone).toBeNull();
    expect(brand.currency).toBe('GEL');
  });
});
