import { describe, expect, it } from 'vitest';
import {
  aggregateWarnings,
  monthlyPayments,
  shopItemQuantity,
  sourceChanges,
  isLiveSubscription,
  syncSaleDisposition,
  selectSubscriptionSales,
  packageSubscriptionDetails,
  soldSubscriptionDetails,
  tbilisiEndOfDay,
  instant,
  localWeekday,
  workoutRules,
  minorUnits,
  parseSmartCrm,
  paymentMethod,
  sourceId,
  staffRole,
  syntheticEmail,
  visitIds,
} from './smartcrm-mapping';

const workout = () => ({
  sourceId: '7',
  groupSourceId: '3',
  groupName: 'Example class',
  trainerStaffSourceId: null,
  title: 'Example workout',
  startsAt: '2025-01-06T09:00:00+04:00',
  durationMinutes: 60,
  capacity: 12,
  recurrenceType: 'weekly' as const,
  recurrenceDays: ['mon', 'sat'] as Array<'mon' | 'sat'>,
  weeklyTimes: { mon: '09:00', sat: '10:30' },
  recurrenceEndsAt: null,
  active: true,
  raw: {},
});

const empty = () => ({
  gym: { name: 'Example Club', branch: 'North', timezone: 'Asia/Tbilisi', currency: 'GEL' },
  paymentTypes: [],
  discounts: [],
  services: [],
  packages: [],
  staff: [],
  clients: [],
  soldPackages: [],
  visits: [],
  groups: [],
  workouts: [],
  sessions: [],
  products: [],
});

describe('Smart CRM pure mapping', () => {
  it('parses a complete export and rejects missing sections', () => {
    expect(parseSmartCrm(JSON.stringify(empty())).clients).toEqual([]);
    expect(() => parseSmartCrm('{}')).toThrow('Invalid Smart CRM input');
    expect(() => parseSmartCrm('{')).toThrow('Invalid JSON input');
  });

  it('does not leak source values in schema diagnostics', () => {
    const input = { ...empty(), gym: { ...empty().gym, currency: 'private-value' } };
    try {
      parseSmartCrm(JSON.stringify(input));
      throw new Error('expected validation error');
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('private-value');
      expect(JSON.stringify(error)).toContain('gym.currency');
    }
  });

  it('rejects duplicate ids and broken references before database work', () => {
    expect(() =>
      parseSmartCrm(
        JSON.stringify({
          ...empty(),
          services: [
            { sourceId: '8', name: 'A' },
            { sourceId: '8', name: 'B' },
          ],
        }),
      ),
    ).toThrow('Duplicate sourceId');
    expect(() =>
      parseSmartCrm(
        JSON.stringify({
          ...empty(),
          visits: [
            {
              clientSourceId: '99',
              checkInAt: '2025-01-02T10:00:00',
              checkOutAt: null,
              service: null,
            },
          ],
        }),
      ),
    ).toThrow('Unresolved visits reference');
  });

  it('converts GEL decimal strings without floating point rounding', () => {
    expect(minorUnits('220.00')).toBe(22000);
    expect(minorUnits('0.29')).toBe(29);
    expect(minorUnits('8.5')).toBe(850);
  });

  it('interprets naive dates in Tbilisi independently of host timezone', () => {
    expect(instant('2025-02-03T07:15:00').toISOString()).toBe('2025-02-03T03:15:00.000Z');
    expect(instant('2025-02-03T07:15:00+04:00').toISOString()).toBe('2025-02-03T03:15:00.000Z');
    expect(instant('2025-02-03').toISOString()).toBe('2025-02-02T20:00:00.000Z');
  });

  it('keeps source identities separate by gym and entity kind', () => {
    expect(sourceId('example', 'client', '1')).toBe(sourceId('example', 'client', '1'));
    expect(sourceId('example', 'client', '1')).not.toBe(sourceId('other', 'client', '1'));
    expect(sourceId('example', 'staff', '1')).not.toBe(sourceId('example', 'client', '1'));
    expect(syntheticEmail('example', 'client', '1')).toMatch(/@no-login\.fit\.local$/);
  });

  it('does not grant security staff administrator privileges', () => {
    expect(staffRole('დაცვა')).toBeNull();
    expect(staffRole('მწვრთნელი')).toBe('TRAINER');
    expect(staffRole('რესეფშენი')).toBe('RECEPTIONIST');
    expect(staffRole('მენეჯერი')).toBe('MANAGER');
    expect(staffRole('ადმინისტრატორი')).toBe('MANAGER');
  });

  it('does not pretend instalments are a supported payment method', () => {
    expect(paymentMethod('instalment')).toBe('BANK_TRANSFER');
    expect(paymentMethod('თბს განაწილება')).toBe('BANK_TRANSFER');
    expect(paymentMethod('ნაწილ ნაწილი ბანკი')).toBe('BANK_TRANSFER');
    expect(paymentMethod('კლუბი ნაწილ-ნაწილ (4 თვიანი)')).toBe('BANK_TRANSFER');
    expect(paymentMethod('voucher')).toBeNull();
    expect(paymentMethod('cash')).toBe('CASH');
    expect(paymentMethod('Example terminal')).toBe('CARD');
    expect(paymentMethod('bank transfer')).toBe('BANK_TRANSFER');
  });

  it('preserves repeated door events without depending on unrelated row order', () => {
    const first = {
      clientSourceId: '1',
      checkInAt: '2025-01-02T10:00:00',
      checkOutAt: null,
      service: null,
    };
    const other = { ...first, clientSourceId: '2' };
    const a = visitIds('example', [first, first, other]);
    const b = visitIds('example', [other, first, first]);
    expect(new Set(a).size).toBe(3);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('keeps different per-day workout times and Tbilisi weekday boundaries', () => {
    expect(workoutRules(workout())).toEqual([
      { day: 'mon', startTime: '09:00', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
      { day: 'sat', startTime: '10:30', rrule: 'FREQ=WEEKLY;BYDAY=SA' },
    ]);
    expect(localWeekday('2025-01-05T22:00:00Z')).toBe('mon');
  });

  it('accepts decimal percentage strings and nullable group capacity from exports', () => {
    const data = parseSmartCrm(
      JSON.stringify({
        ...empty(),
        discounts: [
          {
            sourceId: '1',
            name: 'Example discount',
            percent: '12.50',
            active: true,
            endDate: null,
          },
        ],
        groups: [{ sourceId: '3', name: 'Example class', maxClients: null, active: true }],
        workouts: [{ ...workout(), trainerStaffSourceId: '999' }],
      }),
    );
    expect(data.discounts[0]?.percent).toBe(12.5);
    expect(data.groups[0]?.maxClients).toBeNull();
  });

  it('rejects an inverted session interval', () => {
    expect(() =>
      parseSmartCrm(
        JSON.stringify({
          ...empty(),
          groups: [{ sourceId: '3', name: 'Example class', maxClients: 12, active: true }],
          workouts: [workout()],
          sessions: [
            {
              sourceId: '1',
              workoutSourceId: '7',
              title: 'Stretch',
              start: '2025-01-02T10:00:00Z',
              end: '2025-01-02T09:00:00Z',
              capacity: 12,
              bookedCount: 0,
              cancelled: false,
            },
          ],
        }),
      ),
    ).toThrow('Session end must follow start');
  });
  it('uses inclusive Tbilisi expiry and readable catalogue restrictions', () => {
    expect(tbilisiEndOfDay('2025-02-03').toISOString()).toBe('2025-02-03T19:59:59.999Z');
    expect(tbilisiEndOfDay('2025-02-02T22:00:00Z').toISOString()).toBe('2025-02-03T19:59:59.999Z');
    const pkg = {
      sourceId: '1',
      name: 'Example pack',
      price: '40.00',
      visitCount: 8,
      daysCount: 30,
      active: true,
      visible: true,
      smsName: null,
      totalPauseDays: 5,
      catalogEndDate: null,
      lines: [
        {
          serviceSourceId: '1',
          serviceName: 'Example service',
          startTime: null,
          endTime: null,
          visitCount: 8,
          price: '40.00',
          schedule: [{ day: 1, active: true, start: '07:00', end: '15:00' }],
        },
      ],
    };
    const details = packageSubscriptionDetails(pkg);
    expect(details.interval).toBe('MONTH');
    expect(details.description).toContain('ორშაბათი: 07:00–15:00');
    expect(details.features).toContain('ვიზიტების ლიმიტი: 8');
    expect(packageSubscriptionDetails({ ...pkg, daysCount: 365 }).interval).toBe('YEAR');
    const sale = {
      sourceId: '1',
      clientSourceId: '1',
      packageSourceId: '1',
      price: '40.00',
      paidAmount: '35.00',
      discountPercent: 12.5,
      saleTypeSourceId: null,
      paymentTypeSourceId: null,
      creatorStaffSourceId: null,
      visitsLeft: 5,
      visitsCount: 8,
      endDate: '2025-02-03',
      soldAt: '2025-01-03T10:00:00+04:00',
      expired: false,
      pauseStatus: false,
      pauseStartDate: null,
      pauseEndDate: null,
      remainingPause: null,
      activationDate: '2025-01-04T10:00:00+04:00',
      activationStatus: true,
    };
    const mapped = soldSubscriptionDetails(sale, pkg);
    expect(mapped.status).toBe('ACTIVE');
    expect(mapped.priceAmount).toBe(3500);
    expect(mapped.cancelAtPeriodEnd).toBe(true);
    expect(mapped.provider).toBe('smartcrm-import');
    expect(mapped.currentPeriodStart).toEqual(instant(sale.activationDate));
    expect(mapped.createdAt).toEqual(instant(sale.soldAt));
    expect(soldSubscriptionDetails({ ...sale, expired: true, pauseStatus: true }, pkg).status).toBe(
      'EXPIRED',
    );
    const openPause = soldSubscriptionDetails({ ...sale, pauseStatus: true }, pkg);
    expect(openPause.status).toBe('FROZEN');
    expect(openPause.frozenAt).toEqual(instant(sale.soldAt));
    expect(openPause.frozenUntil).toBeNull();
    const frozen = soldSubscriptionDetails(
      { ...sale, pauseStatus: true, pauseStartDate: '2025-01-10', pauseEndDate: '2025-01-12' },
      pkg,
    );
    expect(frozen.status).toBe('FROZEN');
    expect(frozen.frozenUntil).toEqual(instant('2025-01-12'));
  });

  it('aggregates warning counts with at most five source identifiers', () => {
    const warnings = aggregateWarnings(
      Array.from({ length: 12 }, (_, i) => ({
        section: 'soldPackages' as const,
        code: 'LIMIT_NOT_ENFORCED',
        sourceId: String(i),
      })),
    );
    expect(warnings).toEqual([
      {
        code: 'LIMIT_NOT_ENFORCED',
        count: 12,
        sourceIds: ['0', '1', '2', '3', '4'],
        sections: ['soldPackages'],
      },
    ]);
  });

  it('chooses latest expiry, then latest sale, retaining all expired history', () => {
    const base = {
      clientSourceId: '1',
      expired: false,
      endDate: '2025-12-31',
      soldAt: '2025-01-01',
    };
    const sales = [
      { ...base, sourceId: '1' },
      { ...base, sourceId: '2', endDate: '2025-11-30', soldAt: '2025-03-01' },
      { ...base, sourceId: '3', soldAt: '2025-02-01' },
      { ...base, sourceId: '4', expired: true },
      { ...base, sourceId: '5', expired: true },
      { ...base, sourceId: '6', clientSourceId: '2' },
    ];
    const result = selectSubscriptionSales(sales);
    expect(result.selected.map((s) => s.sourceId)).toEqual(['3', '4', '5', '6']);
    expect(result.noteOnly.map((s) => s.sourceId)).toEqual(['1', '2']);
    expect(
      selectSubscriptionSales([...sales].reverse())
        .selected.map((s) => s.sourceId)
        .sort(),
    ).toEqual(['3', '4', '5', '6']);
  });
});

describe('Smart CRM sync decisions', () => {
  it('counts only changed source columns and compares dates and arrays by value', () => {
    const previous = {
      name: 'Example',
      startsAt: new Date('2026-01-01Z'),
      tags: ['one'],
      native: 7,
    };
    expect(
      sourceChanges(previous, {
        name: 'Example',
        startsAt: new Date('2026-01-01Z'),
        tags: ['one'],
      }),
    ).toEqual({});
    expect(sourceChanges(previous, { name: 'Updated', tags: [], missing: undefined })).toEqual({
      name: 'Updated',
      tags: [],
    });
    expect(sourceChanges({ frozenAt: new Date('2026-01-01Z') }, { frozenAt: null })).toEqual({
      frozenAt: null,
    });
  });

  it('demotes displaced existing sales but keeps displaced new sales note-only', () => {
    expect(syncSaleDisposition(false, false, true)).toBe('expired');
    expect(syncSaleDisposition(false, false, false)).toBe('note-only');
    expect(syncSaleDisposition(true, false, false)).toBe('source');
    expect(syncSaleDisposition(true, false, true)).toBe('source');
  });

  it('never promotes or inserts live import access over a native live subscription', () => {
    expect(syncSaleDisposition(true, true, true)).toBe('expired');
    expect(syncSaleDisposition(true, true, false)).toBe('note-only');
    for (const status of ['ACTIVE', 'FROZEN', 'PAST_DUE', 'TRIAL'])
      expect(isLiveSubscription(status)).toBe(true);
    for (const status of ['EXPIRED', 'CANCELED']) expect(isLiveSubscription(status)).toBe(false);
  });
});

describe('Smart CRM card and shop revenue', () => {
  const product = {
    sourceId: '91',
    name: 'Example item',
    barcode: null,
    purchasePrice: '1.00',
    salePrice: '4.00',
    stock: 8,
    active: true,
  };
  const sale = () => ({
    sourceId: '92',
    soldAt: '2025-02-01T00:30:00',
    staffSourceId: '999',
    paymentTypeSourceId: null,
    total: '1.50',
    lines: [
      {
        sourceId: '93',
        productSourceId: '91',
        productName: 'Example item',
        quantity: 0.5,
        unitPrice: '4.00',
        amount: '1.50',
        discountPercent: '25',
      },
    ],
  });
  const parse = (shopSales: unknown[]) =>
    parseSmartCrm(
      JSON.stringify({
        ...empty(),
        products: [product],
        shopSales,
      }),
    );

  it('accepts old exports and fractional discounted shop lines with deleted sellers', () => {
    expect(parseSmartCrm(JSON.stringify(empty())).shopSales).toBeUndefined();
    expect(parse([sale()]).shopSales?.[0]?.lines[0]?.quantity).toBe(0.5);
    expect(shopItemQuantity(0.5)).toBe(1);
    expect(shopItemQuantity(2.6)).toBe(3);
    expect(shopItemQuantity(2)).toBe(2);
  });

  it('accepts nonpositive totals for the planner to skip and converts signed cents exactly', () => {
    for (const total of ['0.00', '-1.25']) {
      const row = sale();
      row.total = total;
      row.lines[0]!.amount = total;
      expect(parse([row]).shopSales?.[0]?.total).toBe(total);
    }
    expect(minorUnits('-1.25')).toBe(-125);
    expect(minorUnits('-0.01')).toBe(-1);
  });

  it('rejects broken products, duplicate sale/line ids and inconsistent totals before writes', () => {
    const broken = sale();
    broken.lines[0]!.productSourceId = '999';
    expect(() => parse([broken])).toThrow('Invalid shop sale line reference');
    expect(() => parse([sale(), sale()])).toThrow('Duplicate sourceId');
    const duplicate = sale();
    duplicate.lines.push({ ...duplicate.lines[0]! });
    expect(() => parse([duplicate])).toThrow('Invalid shop sale line reference');
    expect(() => parse([{ ...sale(), total: '2.00' }])).toThrow('Shop sale total differs');
  });

  it('groups captured planned and existing payments by gym month without double counting', () => {
    const payment = (id: string, amount: number, date: string, status = 'CAPTURED') => ({
      id,
      amount,
      createdAt: new Date(date),
      status,
    });
    expect(
      monthlyPayments(
        [
          payment('a', 999, '2025-01-31T20:00:00Z'),
          payment('b', 125, '2025-01-31T20:00:00Z'),
          payment('c', 400, '2025-02-02T00:00:00Z'),
        ],
        [
          payment('a', 250, '2025-01-31T19:59:59Z'),
          payment('c', 400, '2025-02-02T00:00:00Z', 'REFUNDED'),
          payment('d', 75, '2025-02-02T00:00:00Z'),
        ],
        'Asia/Tbilisi',
      ),
    ).toEqual([
      { month: '2025-01', payments: 1, amountMinor: 250, amount: '2.50' },
      { month: '2025-02', payments: 2, amountMinor: 200, amount: '2.00' },
    ]);
    expect(monthlyPayments([], [], 'Asia/Tbilisi')).toEqual([]);
  });
});
