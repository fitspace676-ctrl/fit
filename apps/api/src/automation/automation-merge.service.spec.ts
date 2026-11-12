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
    gender: 'FEMALE',
    tags: ['vip'],
    location: { name: 'Main', address: 'Street 1', phone: '123' },
    checkIns: [{ checkedInAt: new Date('2026-07-01T00:00:00Z') }],
    joinedAt: new Date('2026-01-15T00:00:00.000Z'),
    dateOfBirth: new Date('1994-03-02T00:00:00.000Z'),
    user: {
      id: 'user-1',
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
  entities?: Record<string, unknown>;
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

  const entityMocks = Object.fromEntries(
    [
      'booking',
      'invoice',
      'order',
      'serviceSession',
      'classInstance',
      'service',
      'trainer',
      'payment',
      'refund',
    ].map((model) => [
      model,
      {
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(
              where.gymId === 'gym-1' ? (overrides?.entities?.[model] ?? null) : null,
            ),
          ),
      },
    ]),
  );
  const prisma = {
    client: {
      ...entityMocks,
      gymMember: { findFirst: memberFindFirst },
      subscription: { findFirst: subscriptionFindFirst },
      gym: { findFirst: gymFindFirst },
      loyaltyLedgerEntry: { findFirst: ledgerFindFirst },
    },
  } as unknown as PrismaService;

  return {
    service: new AutomationMergeService(prisma),
    entityMocks,
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
    const ctx = { entityId: 'gm-1', entityType: 'member' } as const;

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

describe('AutomationMergeService entity contexts', () => {
  const entities = {
    booking: { memberId: 'gm-1', classInstanceId: 'class-1' },
    classInstance: {
      startsAt: new Date('2026-07-08T14:30:00Z'),
      bookedCount: 8,
      capacityOverride: null,
      classType: { name: 'Yoga', capacity: 20 },
      template: null,
      trainer: { name: 'Coach' },
      location: { name: 'Main' },
    },
    invoice: {
      memberId: 'gm-1',
      number: 'INV-42',
      amount: 12000,
      currency: 'GEL',
      issuedAt: new Date('2026-07-08'),
    },
    order: {
      id: 'order-1',
      memberId: 'gm-1',
      total: 24000,
      currency: 'GEL',
      createdAt: new Date('2026-07-07T10:00:00Z'),
      items: [{ label: 'Bottle', qty: 2 }],
      invoices: [{ number: 'INV-7' }],
    },
    serviceSession: {
      memberId: 'gm-1',
      startsAt: new Date('2026-07-08T15:30:00Z'),
      staffId: 'staff-1',
      serviceId: 'service-1',
    },
    service: { name: 'Personal training' },
  };
  it.each([
    [
      'booking',
      {
        class_name: 'Yoga',
        class_date: '2026-07-08',
        class_time: '14:30',
        class_trainer_name: 'Coach',
        class_location: 'Main',
      },
    ],
    ['invoice', { invoice_number: 'INV-42', invoice_date: '2026-07-08' }],
    ['order', { order_items: 'Bottle × 2' }],
    [
      'service_session',
      {
        session_name: 'Personal training',
        session_date: '2026-07-08',
        session_time: '15:30',
        session_trainer_name: 'Nino Beridze',
      },
    ],
  ] as const)('resolves %s tokens', async (entityType, expected) => {
    const { service, entityMocks } = setup({ entities });
    const result = await service.resolve('gym-1', { entityId: 'entity-1', entityType }, BRAND);
    expect(result).toMatchObject({
      memberId: 'gm-1',
      recipient: 'nino@example.com',
      values: expected,
    });
    expect(result?.values).toMatchObject({
      member_gender: 'FEMALE',
      member_tags: 'vip',
      member_branch_name: 'Main',
      member_branch_address: 'Street 1',
      member_branch_phone: '123',
      member_last_checkin_date: '2026-07-01',
    });
    if (entityType === 'invoice') expect(result?.values.invoice_amount).toContain('120');
    if (entityType === 'order') expect(result?.values.order_total).toContain('240');
    for (const delegate of Object.values(entityMocks)) {
      for (const [args] of delegate.findFirst.mock.calls)
        expect((args as { where: { gymId: string } }).where.gymId).toBe('gym-1');
    }
  });
  it.each(['booking', 'invoice', 'order', 'service_session'] as const)(
    'rejects another gym’s %s id',
    async (entityType) => {
      const { service, memberFindFirst } = setup({ entities });
      expect(
        await service.resolve('gym-2', { entityId: 'entity-1', entityType }, BRAND),
      ).toBeNull();
      expect(memberFindFirst).not.toHaveBeenCalled();
    },
  );
  it('uses the triggering subscription even after it expires', async () => {
    const { service } = setup({
      member: memberRow({ subscriptions: [] }),
      subscription: {
        memberId: 'gm-1',
        currentPeriodEnd: new Date('2026-07-01'),
        currentPeriodStart: new Date('2026-06-01'),
        frozenUntil: null,
        priceAmount: 15000,
        currency: 'GEL',
        status: 'EXPIRED',
        plan: { name: 'Expired Gold' },
      },
    });
    const result = await service.resolve(
      'gym-1',
      { entityId: 'expired-sub', entityType: 'subscription' },
      BRAND,
    );
    expect(result?.values).toMatchObject({
      member_subscription_status: 'EXPIRED',
      member_plan_name: 'Expired Gold',
      member_period_start: '2026-06-01',
      member_expiry_date: '2026-07-01',
      member_frozen_until: '',
    });
    expect(result?.values.member_plan_price).toContain('150');
  });
});

// `product_stock_low` is addressed to the gym, never the buyer.
describe('AutomationMergeService gym-recipient trigger', () => {
  const order = {
    id: 'order-1',
    memberId: 'gm-1',
    total: 24000,
    currency: 'GEL',
    createdAt: new Date('2026-07-07T10:00:00Z'),
    items: [{ label: 'Protein bar', qty: 3 }],
    invoices: [],
  };
  const ctx = {
    entityId: 'order-1',
    entityType: 'order',
    triggerType: 'product_stock_low',
  } as const;

  it('addresses the gym business email with business and order tokens only', async () => {
    const { service, memberFindFirst, entityMocks } = setup({ entities: { order } });
    const target = await service.resolve('gym-1', ctx, BRAND);

    expect(target).toMatchObject({
      recipient: 'hello@irongym.ge',
      memberId: null,
      values: {
        business_name: 'Iron Gym',
        business_email: 'hello@irongym.ge',
        business_phone: '+995 555 00 00 00',
        order_items: 'Protein bar × 3',
      },
    });
    expect(target?.values.order_total).toContain('240');
    expect(Object.keys(target?.values ?? {}).some((key) => key.startsWith('member_'))).toBe(false);
    expect(target?.values.email).toBeUndefined();
    expect(memberFindFirst).not.toHaveBeenCalled();
    for (const [args] of entityMocks.order!.findFirst.mock.calls)
      expect((args as { where: { gymId: string } }).where.gymId).toBe('gym-1');
  });

  it('resolves to null for another gym’s order id', async () => {
    const { service, memberFindFirst } = setup({ entities: { order } });
    expect(await service.resolve('gym-2', ctx, BRAND)).toBeNull();
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it('leaves the recipient null when the gym has no business email', async () => {
    const { service } = setup({ entities: { order } });
    const target = await service.resolve('gym-1', ctx, {
      ...BRAND,
      business: { ...BRAND.business, email: '  ' },
    });
    expect(target?.recipient).toBeNull();
    expect(target?.values.order_items).toBe('Protein bar × 3');
  });
});

// The catalogue renamed most tokens; a saved rule written with the old name has
// to read exactly what the new one does.
describe('AutomationMergeService catalogue tokens and aliases', () => {
  const NOW = new Date('2026-07-08T12:00:00Z');
  const member = { entityId: 'gm-1', entityType: 'member', now: NOW } as const;

  it('fills every new token and its aliases with the same value', async () => {
    const { service } = setup();
    const values = (await service.resolve('gym-1', member, BRAND))?.values ?? {};

    for (const [token, aliases] of [
      ['first_name', ['member_first_name']],
      ['full_name', ['member_full_name']],
      ['member_since', ['member_join_date', 'join_date']],
      ['branch_name', ['member_branch_name']],
      ['last_checkin_date', ['member_last_checkin_date']],
      ['membership_plan', ['member_plan_name', 'plan_name']],
      ['expiry_date', ['member_expiry_date']],
      ['days_remaining', ['member_days_until_expiry', 'days_until_expiry']],
      ['renewal_date', ['payment_due_date']],
      ['plan_price', ['member_plan_price']],
    ] as const) {
      expect(values[token], token).not.toBeUndefined();
      for (const alias of aliases) expect(values[alias], alias).toBe(values[token]);
    }
    expect(values).toMatchObject({
      expiry_date: '2026-09-01',
      member_since: '2026-01-15',
      membership_plan: 'Gold',
      access_end_date: '2026-09-01',
      days_inactive: '7',
      recipient_name: 'Nino Beridze',
      related_member_name: 'Nino Beridze',
    });
  });

  it('counts days inactive from joining when the member never checked in', async () => {
    const { service } = setup({ member: { ...memberRow(), checkIns: [] } });
    const values = (await service.resolve('gym-1', member, BRAND))?.values;
    expect(values?.days_inactive).toBe('174');
    expect(values?.last_checkin_date).toBe('');
  });

  it('blanks catalogue tokens no source fills, and carries the offer values', async () => {
    const { service } = setup();
    const plain = (await service.resolve('gym-1', member, BRAND))?.values;
    expect(plain).toMatchObject({ discount_percent: '', offer_code: '', class_name: '' });

    const offered = await service.resolve(
      'gym-1',
      {
        ...member,
        extraValues: {
          discount_percent: '20',
          bonus_points: '100',
          offer_code: 'BACK20',
          offer_expiry: '2026-08-01',
        },
      },
      BRAND,
    );
    expect(offered?.values).toMatchObject({
      discount_percent: '20',
      bonus_points: '100',
      offer_code: 'BACK20',
      offer_expiry: '2026-08-01',
    });
  });

  it.each([
    ['en', 'member', 'member'],
    ['en', 'trainer', 'trainer'],
    ['ka', 'member', 'წევრი'],
    ['ka', 'trainer', 'მწვრთნელი'],
    ['ka', 'robot', ''],
  ] as const)('shows cancelled_by in %s (%s)', async (language, code, expected) => {
    const { service } = setup();
    const target = await service.resolve(
      'gym-1',
      { ...member, extraValues: { cancelled_by: code } },
      { ...BRAND, language },
    );
    expect(target?.values.cancelled_by).toBe(expected);
  });

  it('fills the subscription cancellation, freeze and access tokens', async () => {
    const { service } = setup({
      subscription: {
        memberId: 'gm-1',
        currentPeriodEnd: new Date('2026-07-31'),
        currentPeriodStart: new Date('2026-07-01'),
        frozenUntil: new Date('2026-07-20'),
        frozenAt: new Date('2026-07-10'),
        canceledAt: new Date('2026-07-05'),
        priceAmount: 15000,
        currency: 'GEL',
        status: 'ACTIVE',
        plan: { name: 'Silver' },
      },
    });
    const values = (
      await service.resolve(
        'gym-1',
        { entityId: 'sub-1', entityType: 'subscription', now: NOW },
        BRAND,
      )
    )?.values;
    expect(values).toMatchObject({
      membership_plan: 'Silver',
      member_plan_name: 'Silver',
      cancellation_date: '2026-07-05',
      cancellation_reason: '',
      freeze_start_date: '2026-07-10',
      freeze_end_date: '2026-07-20',
      member_frozen_until: '2026-07-20',
      access_end_date: '2026-07-31',
      days_remaining: '22',
    });
  });

  const entities = {
    booking: { memberId: 'gm-1', classInstanceId: 'class-1', waitlistPosition: 3 },
    classInstance: {
      startsAt: new Date('2026-07-10T18:00:00Z'),
      bookedCount: 12,
      capacityOverride: null,
      classType: { name: 'Spin', capacity: 15 },
      template: {
        title: 'Spin',
        capacity: 14,
        trainer: null,
        location: { gymId: 'gym-1', name: 'Hall' },
      },
      trainer: { name: 'Coach Gio' },
      location: null,
      trainerId: 'tr-1',
    },
    invoice: {
      memberId: 'gm-1',
      number: 'INV-9',
      amount: 5000,
      currency: 'GEL',
      issuedAt: new Date('2026-07-01'),
      dueDate: new Date('2026-07-15'),
      orderId: 'order-1',
    },
    payment: { method: 'CARD' },
    refund: { amount: 2500, createdAt: new Date('2026-07-06T09:00:00Z') },
    order: {
      id: 'order-1',
      memberId: 'gm-1',
      total: 9000,
      currency: 'GEL',
      createdAt: new Date('2026-07-02T10:00:00Z'),
      items: [
        { label: 'Shaker', qty: 1 },
        { label: 'Whey', qty: 2 },
      ],
      invoices: [{ number: 'INV-9' }],
    },
    serviceSession: {
      memberId: 'gm-1',
      startsAt: new Date('2026-07-09T08:00:00Z'),
      staffId: 'staff-1',
      serviceId: 'service-1',
      location: { gymId: 'gym-1', name: 'Studio' },
    },
    service: { name: 'PT 60' },
    trainer: { name: 'Coach Gio', staffId: 'staff-1' },
  };

  it('fills the class fill, waitlist and missed-class tokens on a booking', async () => {
    const { service } = setup({ entities });
    const values = (
      await service.resolve('gym-1', { entityId: 'b-1', entityType: 'booking' }, BRAND)
    )?.values;
    expect(values).toMatchObject({
      class_name: 'Spin',
      trainer_name: 'Coach Gio',
      class_trainer_name: 'Coach Gio',
      location: 'Hall',
      class_location: 'Hall',
      waitlist_position: '3',
      spots_filled: '12',
      spots_total: '14',
      missed_class_name: 'Spin',
      missed_class_date: '2026-07-10',
    });
  });

  it('fills the invoice due date, method and refund tokens', async () => {
    const { service } = setup({ entities });
    const values = (
      await service.resolve('gym-1', { entityId: 'inv-1', entityType: 'invoice' }, BRAND)
    )?.values;
    expect(values).toMatchObject({
      invoice_number: 'INV-9',
      payment_date: '2026-07-01',
      invoice_date: '2026-07-01',
      due_date: '2026-07-15',
      payment_method: 'card',
      failure_reason: '',
      refund_date: '2026-07-06',
    });
    expect(values?.amount).toContain('50');
    expect(values?.invoice_amount).toBe(values?.amount);
    expect(values?.refund_amount).toContain('25');
  });

  it('fills the order product, number, date and refund tokens', async () => {
    const { service, entityMocks } = setup({ entities });
    const values = (
      await service.resolve('gym-1', { entityId: 'order-1', entityType: 'order' }, BRAND)
    )?.values;
    expect(values).toMatchObject({
      product_name: 'Shaker, Whey',
      order_number: 'INV-9',
      purchase_date: '2026-07-02',
      refund_date: '2026-07-06',
    });
    expect(entityMocks.refund!.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { orderId: 'order-1', gymId: 'gym-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('fills the PT session tokens under the new and old names', async () => {
    const { service } = setup({ entities });
    const values = (
      await service.resolve(
        'gym-1',
        {
          entityId: 's-1',
          entityType: 'service_session',
          extraValues: { cancelled_by: 'trainer' },
        },
        BRAND,
      )
    )?.values;
    expect(values).toMatchObject({
      session_type: 'PT 60',
      session_name: 'PT 60',
      trainer_name: 'Nino Beridze',
      session_trainer_name: 'Nino Beridze',
      location: 'Studio',
      cancelled_by: 'trainer',
    });
  });
});

// A trainer-recipient rule mails the trainer, but the message is still about
// the member: the member tokens stay the member's.
describe('AutomationMergeService trainer recipient', () => {
  const staff = {
    firstName: 'Gio',
    lastName: 'Coach',
    user: { id: 'user-staff', name: 'Gio Coach', email: 'gio@irongym.ge' },
  };
  const entities = {
    booking: { memberId: 'gm-1', classInstanceId: 'class-1', waitlistPosition: null },
    classInstance: {
      startsAt: new Date('2026-07-10T18:00:00Z'),
      bookedCount: 1,
      capacityOverride: 10,
      classType: { name: 'Spin', capacity: 15 },
      template: null,
      trainer: { name: 'Coach Gio' },
      location: null,
      trainerId: 'tr-1',
    },
    trainer: { name: 'Coach Gio', staffId: 'staff-1' },
    serviceSession: {
      memberId: 'gm-1',
      startsAt: new Date('2026-07-09T08:00:00Z'),
      staffId: 'staff-1',
      serviceId: 'service-1',
      location: null,
    },
    service: { name: 'PT 60' },
  };

  function trainerSetup(over?: { trainer?: unknown; staffGym?: string }) {
    const ctx = setup({
      entities: { ...entities, ...(over?.trainer === undefined ? {} : { trainer: over.trainer }) },
    });
    ctx.memberFindFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where?.id === 'staff-1'
          ? where.gymId === (over?.staffGym ?? 'gym-1')
            ? staff
            : null
          : memberRow(),
      ),
    );
    return ctx;
  }

  it('addresses the class trainer’s staff account on a booking', async () => {
    const { service, entityMocks, memberFindFirst } = trainerSetup();
    const target = await service.resolve(
      'gym-1',
      { entityId: 'b-1', entityType: 'booking', recipient: 'trainer' },
      BRAND,
    );
    expect(target).toMatchObject({
      recipient: 'gio@irongym.ge',
      userId: 'user-staff',
      memberId: 'gm-1',
      values: {
        recipient_name: 'Coach Gio',
        related_member_name: 'Nino Beridze',
        first_name: 'Nino',
        member_first_name: 'Nino',
        class_name: 'Spin',
        spots_total: '10',
      },
    });
    expect(entityMocks.trainer!.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'tr-1', gymId: 'gym-1' },
    });
    for (const [args] of memberFindFirst.mock.calls) expect(args.where?.gymId).toBe('gym-1');
  });

  it('addresses the session staff member on a PT session', async () => {
    const { service } = trainerSetup();
    const target = await service.resolve(
      'gym-1',
      { entityId: 's-1', entityType: 'service_session', recipient: 'trainer' },
      BRAND,
    );
    expect(target).toMatchObject({
      recipient: 'gio@irongym.ge',
      userId: 'user-staff',
      values: { recipient_name: 'Gio Coach', related_member_name: 'Nino Beridze' },
    });
  });

  it('has no recipient when the trainer has no staff account', async () => {
    const { service } = trainerSetup({ trainer: { name: 'Coach Gio', staffId: null } });
    const target = await service.resolve(
      'gym-1',
      { entityId: 'b-1', entityType: 'booking', recipient: 'trainer' },
      BRAND,
    );
    expect(target).toMatchObject({
      recipient: null,
      userId: null,
      values: { recipient_name: 'Coach Gio', first_name: 'Nino' },
    });
  });

  it('never reaches a staff account in another gym', async () => {
    const { service } = trainerSetup({ staffGym: 'gym-2' });
    const target = await service.resolve(
      'gym-1',
      { entityId: 's-1', entityType: 'service_session', recipient: 'trainer' },
      BRAND,
    );
    expect(target?.recipient).toBeNull();
    expect(target?.userId).toBeNull();
  });

  it('resolves another gym’s booking to null', async () => {
    const { service } = trainerSetup();
    expect(
      await service.resolve(
        'gym-2',
        { entityId: 'b-1', entityType: 'booking', recipient: 'trainer' },
        BRAND,
      ),
    ).toBeNull();
  });
});
