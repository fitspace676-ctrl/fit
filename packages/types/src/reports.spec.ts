import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_RANGE,
  formatReportCsvCell,
  DEFAULT_REPORT_KEY,
  groupReportsBySegment,
  isOfferedReport,
  OFFERED_REPORT_KEYS,
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  REPORT_DIGEST_KEYS,
  REPORT_DIGEST_RANGE,
  REPORT_KEYS,
  REPORT_SEGMENTS,
  reportCsvRow,
  reportExportQuerySchema,
  reportQuerySchema,
  reportRangeSchema,
  reportQueryParams,
  reportWindowInput,
  reportWindowSlug,
  reportWindowPresetSchema,
  reportXlsxCell,
  reportXlsxRow,
  type ReportColumn,
} from './reports';

describe('report definitions', () => {
  it('has a definition for every key, offered or retired', () => {
    for (const key of REPORT_KEYS) {
      expect(REPORT_DEFINITIONS[key].key).toBe(key);
    }
  });

  it('the catalogue lists the OFFERED reports only, in their own order', () => {
    expect(REPORT_CATALOG.map((r) => r.key)).toEqual([...OFFERED_REPORT_KEYS]);
    for (const key of OFFERED_REPORT_KEYS) {
      expect(REPORT_KEYS).toContain(key);
      expect(isOfferedReport(key)).toBe(true);
    }
    expect(isOfferedReport('sales-summary')).toBe(false);
  });

  it('offers exactly the reports the owner specified segment by segment on 2026-09-02', () => {
    expect([...OFFERED_REPORT_KEYS]).toEqual([
      'sales-transactions',
      'plan-performance',
      'daily-reconciliation',
      'refunds-detail',
      'member-roster',
      'member-check-in-log',
      'members-at-risk',
      'outstanding-invoices',
      'projected-revenue',
      'revenue-by-payment-method',
      'product-sales',
      'product-sales-detail',
      'stock-inventory',
      'stock-movements',
      'attendance-by-class',
      'class-cancellations',
      'pt-sessions',
      'credit-usage',
      'trainer-activity',
      'trainer-activity-detail',
      'trainer-sales',
      'trainer-sales-detail',
      'staff-schedule',
      'audit-log',
    ]);
    expect(groupReportsBySegment(REPORT_CATALOG).map((g) => g.segment)).toEqual([
      ...REPORT_SEGMENTS,
    ]);
  });

  it('opens the hub on the first offered report, not the first key', () => {
    expect(DEFAULT_REPORT_KEY).toBe(OFFERED_REPORT_KEYS[0]);
    expect(isOfferedReport(DEFAULT_REPORT_KEY)).toBe(true);
  });

  it('every definition has a non-empty column list with unique keys', () => {
    for (const key of REPORT_KEYS) {
      const columns = REPORT_DEFINITIONS[key].columns;
      expect(columns.length).toBeGreaterThan(0);
      const keys = columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('files every report under a real segment', () => {
    for (const key of REPORT_KEYS) {
      expect(REPORT_SEGMENTS).toContain(REPORT_DEFINITIONS[key].segment);
    }
  });
});

describe('sales-transactions', () => {
  it('lists every transaction column the front desk asked for, in reading order', () => {
    const definition = REPORT_DEFINITIONS['sales-transactions'];
    expect(definition.segment).toBe('sales');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'reference',
      'customer',
      'items',
      'category',
      'amount',
      'method',
      'channel',
      'location',
      'staff',
      'status',
    ]);
    expect(definition.columns.find((c) => c.key === 'amount')?.type).toBe('money');
  });
});

describe('plan-performance, refunds-detail, daily-reconciliation', () => {
  it('plan & service performance names the item, its kind, how many, how much, its share and where', () => {
    expect(REPORT_DEFINITIONS['plan-performance'].columns.map((c) => c.key)).toEqual([
      'item',
      'category',
      'sold',
      'revenue',
      'share',
      'location',
    ]);
    expect(
      REPORT_DEFINITIONS['plan-performance'].columns.find((c) => c.key === 'share')?.type,
    ).toBe('percent');
  });

  it('refunds carry when, who, what was refunded, how much, why, by whom and where', () => {
    expect(REPORT_DEFINITIONS['refunds-detail'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'customer',
      'order',
      'items',
      'amount',
      'reason',
      'processedBy',
      'location',
    ]);
  });

  it('daily reconciliation splits each day by how the money was collected', () => {
    const definition = REPORT_DEFINITIONS['daily-reconciliation'];
    expect(definition.segment).toBe('sales');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'date',
      'total',
      'cash',
      'card',
      'online',
      'bankTransfer',
      'other',
      'refunds',
      'transactions',
      'references',
    ]);
  });
});

describe('member reports', () => {
  it('the membership report carries the member base with status, dates, visits and value', () => {
    expect(REPORT_DEFINITIONS['member-roster'].columns.map((c) => c.key)).toEqual([
      'member',
      'phone',
      'email',
      'status',
      'plan',
      'joined',
      'startDate',
      'expiresOn',
      'lastVisit',
      'visits',
      'value',
      'nextRenewal',
    ]);
  });

  it('the check-in report names when, who, how and where', () => {
    expect(REPORT_DEFINITIONS['member-check-in-log'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'member',
      'method',
      'location',
    ]);
  });

  it('retention & engagement files each member under the attention they need', () => {
    expect(REPORT_DEFINITIONS['members-at-risk'].columns.map((c) => c.key)).toEqual([
      'group',
      'member',
      'phone',
      'email',
      'plan',
      'status',
      'lastVisit',
      'daysSince',
      'expiresOn',
      'renewal',
      'value',
    ]);
  });
});

describe('revenue reports', () => {
  it('invoices & payments carry the obligation, what was paid, what is left, and how', () => {
    expect(REPORT_DEFINITIONS['outstanding-invoices'].columns.map((c) => c.key)).toEqual([
      'invoice',
      'member',
      'item',
      'issuedAt',
      'dueDate',
      'amount',
      'paid',
      'outstanding',
      'status',
      'method',
      'paidAt',
      'location',
    ]);
  });

  it('recurring & projected lists each live subscription with its recurring, monthly and expected amounts', () => {
    expect(REPORT_DEFINITIONS['projected-revenue'].columns.map((c) => c.key)).toEqual([
      'member',
      'plan',
      'recurring',
      'interval',
      'monthly',
      'nextCharge',
      'expected',
      'status',
    ]);
  });

  it('revenue by payment method sits in the revenue segment with a share per method and branch', () => {
    const definition = REPORT_DEFINITIONS['revenue-by-payment-method'];
    expect(definition.segment).toBe('revenue');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'method',
      'payments',
      'revenue',
      'share',
      'location',
    ]);
  });
});

describe('products segment', () => {
  it('sits between revenue and classes with four reports', () => {
    expect(REPORT_SEGMENTS).toEqual([
      'sales',
      'members',
      'revenue',
      'products',
      'classes',
      'staff',
    ]);
    for (const key of [
      'product-sales',
      'product-sales-detail',
      'stock-inventory',
      'stock-movements',
    ] as const) {
      expect(REPORT_DEFINITIONS[key].segment, key).toBe('products');
    }
  });

  it('product sales: per product, variant and branch, with cost, margin and channel split', () => {
    expect(REPORT_DEFINITIONS['product-sales'].columns.map((c) => c.key)).toEqual([
      'product',
      'variant',
      'sku',
      'category',
      'quantity',
      'revenue',
      'cogs',
      'margin',
      'marginPct',
      'avgPrice',
      'posSales',
      'onlineSales',
      'transactions',
      'location',
    ]);
  });

  it('product sales detail: one row per sold line', () => {
    expect(REPORT_DEFINITIONS['product-sales-detail'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'product',
      'variant',
      'quantity',
      'customer',
      'channel',
      'price',
      'cost',
      'margin',
      'method',
      'location',
      'staff',
      'reference',
    ]);
  });

  it('stock & inventory: every stock position with its value and status', () => {
    expect(REPORT_DEFINITIONS['stock-inventory'].columns.map((c) => c.key)).toEqual([
      'product',
      'variant',
      'sku',
      'stock',
      'unitCost',
      'stockValue',
      'threshold',
      'status',
    ]);
  });

  it('stock movements: every change with before, after and value impact', () => {
    expect(REPORT_DEFINITIONS['stock-movements'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'product',
      'variant',
      'sku',
      'type',
      'delta',
      'before',
      'after',
      'valueImpact',
      'reference',
      'staff',
      'note',
    ]);
  });
});

describe('classes & training reports', () => {
  it('classes & attendance: one row per session with the seat counts and utilisation', () => {
    expect(REPORT_DEFINITIONS['attendance-by-class'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'class',
      'trainer',
      'location',
      'capacity',
      'booked',
      'attended',
      'cancelled',
      'noShows',
      'waitlist',
      'utilization',
    ]);
  });

  it('class bookings: every booking with when it was made, its outcome, the check-in and the waitlist place', () => {
    expect(REPORT_DEFINITIONS['class-cancellations'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'class',
      'trainer',
      'location',
      'member',
      'bookedAt',
      'status',
      'checkedIn',
      'waitlistPosition',
    ]);
  });

  it('pt sessions: one row per session with member, trainer, duration and value', () => {
    expect(REPORT_DEFINITIONS['pt-sessions'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'member',
      'trainer',
      'location',
      'status',
      'duration',
      'value',
    ]);
  });

  it('credit usage: purchased, used and remaining per pack', () => {
    const definition = REPORT_DEFINITIONS['credit-usage'];
    expect(definition.segment).toBe('classes');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'member',
      'package',
      'purchased',
      'used',
      'remaining',
      'expiresOn',
      'lastSession',
      'status',
    ]);
  });
});

describe('trainers & staff reports', () => {
  it('trainer activity: per trainer - classes, PT sessions, members, and how bookings ended', () => {
    const definition = REPORT_DEFINITIONS['trainer-activity'];
    expect(definition.segment).toBe('staff');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'trainer',
      'location',
      'classes',
      'ptSessions',
      'membersTrained',
      'attended',
      'cancellations',
      'noShows',
    ]);
  });

  it('trainer activity detail: one row per booking or session, under its trainer', () => {
    const definition = REPORT_DEFINITIONS['trainer-activity-detail'];
    expect(definition.segment).toBe('staff');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'trainer',
      'type',
      'session',
      'member',
      'location',
      'status',
    ]);
  });

  it('trainer sales: per trainer and branch - packages, sessions, value', () => {
    const definition = REPORT_DEFINITIONS['trainer-sales'];
    expect(definition.segment).toBe('staff');
    expect(definition.columns.map((c) => c.key)).toEqual([
      'trainer',
      'packagesSold',
      'sessionsSold',
      'totalValue',
      'location',
    ]);
    expect(REPORT_DEFINITIONS['trainer-sales-detail'].columns.map((c) => c.key)).toEqual([
      'date',
      'trainer',
      'member',
      'package',
      'sessions',
      'amount',
      'location',
    ]);
  });

  it("staff schedule: the weekly shifts projected onto the window's days", () => {
    expect(REPORT_DEFINITIONS['staff-schedule'].columns.map((c) => c.key)).toEqual([
      'staff',
      'role',
      'date',
      'start',
      'end',
      'location',
    ]);
  });

  it('audit log: who did what to which record, with the values before and after', () => {
    expect(REPORT_DEFINITIONS['audit-log'].columns.map((c) => c.key)).toEqual([
      'date',
      'time',
      'staff',
      'action',
      'target',
      'previous',
      'next',
    ]);
  });
});

describe('groupReportsBySegment', () => {
  it('groups in segment order and keeps each segment’s catalogue order', () => {
    const grouped = groupReportsBySegment(REPORT_CATALOG);

    const order = grouped.map((g) => g.segment);
    expect(order).toEqual([...REPORT_SEGMENTS].filter((s) => order.includes(s)));
    for (const group of grouped) {
      expect(group.reports.every((r) => r.segment === group.segment)).toBe(true);
    }
    // Nothing is lost in the grouping.
    expect(grouped.flatMap((g) => g.reports.map((r) => r.key)).sort()).toEqual(
      [...OFFERED_REPORT_KEYS].sort(),
    );
  });

  it('takes the segment labels from the caller, so a localised catalogue groups under its own words', () => {
    const groups = groupReportsBySegment([REPORT_DEFINITIONS['sales-summary']], {
      sales: 'გაყიდვები',
      members: 'წევრები',
      revenue: 'შემოსავალი',
      products: 'პროდუქტები',
      classes: 'კლასები',
      staff: 'პერსონალი',
    });
    expect(groups.map((g) => g.label)).toEqual(['გაყიდვები']);
  });

  it('omits a segment that has no reports rather than rendering an empty heading', () => {
    const salesOnly = REPORT_CATALOG.filter((r) => r.segment === 'sales');

    const grouped = groupReportsBySegment(salesOnly);

    expect(grouped.map((g) => g.segment)).toEqual(['sales']);
  });
});

describe('report digest', () => {
  it('is a CURATED list, not every report in the catalogue', () => {
    // The digest used to alias REPORT_KEYS, which meant adding a report to the
    // console silently added a section to everyone's weekly email.
    expect(REPORT_DIGEST_KEYS.length).toBeLessThan(REPORT_KEYS.length);
    for (const key of REPORT_DIGEST_KEYS) {
      expect(REPORT_KEYS).toContain(key);
    }
  });

  it('never emails a report the console no longer offers', () => {
    for (const key of REPORT_DIGEST_KEYS) {
      expect(isOfferedReport(key), key).toBe(true);
    }
  });
});

describe('report range vocabulary', () => {
  it('offers the console exactly today / 7d / month-to-date / custom', () => {
    expect(reportRangeSchema.options).toEqual(['today', '7d', 'mtd', 'custom']);
  });

  it('opens on month to date', () => {
    expect(DEFAULT_REPORT_RANGE).toBe('mtd');
  });

  it('keeps the dashboard and digest window presets the console no longer offers', () => {
    // `30d` / `12w` / `12m` left the Reports control but the dashboard charts and
    // the emailed digest still window over them.
    expect(reportWindowPresetSchema.options).toEqual(['today', '7d', '30d', 'mtd', '12w', '12m']);
    expect(REPORT_DIGEST_RANGE).toEqual({ weekly: '7d', monthly: '30d' });
  });
});

describe('report query schemas', () => {
  it('defaults the preview range to the shared default', () => {
    expect(reportQuerySchema.parse({})).toEqual({ range: DEFAULT_REPORT_RANGE });
  });

  it('defaults the export to a CSV of the default range', () => {
    expect(reportExportQuerySchema.parse({})).toEqual({
      range: DEFAULT_REPORT_RANGE,
      format: 'csv',
    });
  });

  it('accepts a valid range + format and rejects unknown ones', () => {
    expect(reportExportQuerySchema.parse({ range: 'today', format: 'xlsx' })).toEqual({
      range: 'today',
      format: 'xlsx',
    });
    expect(reportExportQuerySchema.safeParse({ format: 'pdf' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ range: '1y' }).success).toBe(false);
    // The retired presets are a 400 now, not a silent alias.
    expect(reportQuerySchema.safeParse({ range: '30d' }).success).toBe(false);
  });

  it('a custom range carries both of its days', () => {
    expect(
      reportQuerySchema.parse({ range: 'custom', from: '2026-08-01', to: '2026-08-15' }),
    ).toEqual({
      range: 'custom',
      from: '2026-08-01',
      to: '2026-08-15',
    });
    expect(
      reportExportQuerySchema.parse({ range: 'custom', from: '2026-08-01', to: '2026-08-01' }),
    ).toEqual({
      range: 'custom',
      from: '2026-08-01',
      to: '2026-08-01',
      format: 'csv',
    });
  });

  it('rejects a custom range missing a day, out of order, malformed, or over a year', () => {
    const bad = [
      { range: 'custom' },
      { range: 'custom', from: '2026-08-01' },
      { range: 'custom', to: '2026-08-01' },
      { range: 'custom', from: '2026-08-15', to: '2026-08-01' },
      { range: 'custom', from: '2026-8-1', to: '2026-08-15' },
      { range: 'custom', from: '2026-02-30', to: '2026-03-01' },
      { range: 'custom', from: '2025-08-01', to: '2026-08-02' },
    ];
    for (const query of bad) {
      expect(reportQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
      expect(reportExportQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
    // 366 days inclusive is the cap, so a leap year is still one range.
    expect(
      reportQuerySchema.safeParse({ range: 'custom', from: '2025-08-02', to: '2026-08-02' })
        .success,
    ).toBe(true);
  });

  it('drops stray days from a preset so they cannot leak into the window', () => {
    expect(reportQuerySchema.parse({ range: '7d', from: '2026-08-01', to: '2026-08-15' })).toEqual({
      range: '7d',
    });
  });
});

describe('reportQueryParams', () => {
  it('serialises a preset as just its range and a custom range with its days', () => {
    expect(reportQueryParams({ range: '7d' }).toString()).toBe('range=7d');
    expect(
      reportQueryParams({ range: 'custom', from: '2026-08-01', to: '2026-08-15' }).toString(),
    ).toBe('range=custom&from=2026-08-01&to=2026-08-15');
  });
});

describe('reportWindowSlug', () => {
  it('names a preset by its token and a custom range by its two days', () => {
    expect(reportWindowSlug({ range: 'today' })).toBe('today');
    expect(reportWindowSlug({ range: 'custom', from: '2026-08-01', to: '2026-08-15' })).toBe(
      '2026-08-01_2026-08-15',
    );
  });
});

describe('reportWindowInput', () => {
  it('hands a preset through and turns custom into its two days', () => {
    expect(reportWindowInput({ range: 'mtd' })).toBe('mtd');
    expect(reportWindowInput({ range: 'custom', from: '2026-08-01', to: '2026-08-15' })).toEqual({
      from: '2026-08-01',
      to: '2026-08-15',
    });
  });
});

describe('formatReportCsvCell', () => {
  it('renders money minor units as major-unit decimals', () => {
    expect(formatReportCsvCell('money', 1000)).toBe('10.00');
    expect(formatReportCsvCell('money', 0)).toBe('0.00');
    expect(formatReportCsvCell('money', 12345)).toBe('123.45');
  });

  it('renders a percentage to one decimal', () => {
    expect(formatReportCsvCell('percent', 42.5)).toBe('42.5');
    expect(formatReportCsvCell('percent', 100)).toBe('100.0');
  });

  it('passes text/number/date through as strings and null as empty', () => {
    expect(formatReportCsvCell('text', 'POS')).toBe('POS');
    expect(formatReportCsvCell('number', 7)).toBe('7');
    expect(formatReportCsvCell('date', '2026-06-01')).toBe('2026-06-01');
    expect(formatReportCsvCell('percent', null)).toBe('');
    expect(formatReportCsvCell('money', null)).toBe('');
  });
});

describe('reportCsvRow', () => {
  const columns: ReportColumn[] = [
    { key: 'channel', label: 'Channel', type: 'text' },
    { key: 'orders', label: 'Orders', type: 'number' },
    { key: 'net', label: 'Net', type: 'money' },
  ];

  it('emits one cell per column, in order, formatted by type', () => {
    expect(reportCsvRow(columns, { channel: 'POS', orders: 3, net: 4500 })).toEqual([
      'POS',
      '3',
      '45.00',
    ]);
  });

  it('renders a missing key as empty', () => {
    expect(reportCsvRow(columns, { channel: 'ONLINE', orders: 0 })).toEqual(['ONLINE', '0', '']);
  });
});

describe('reportXlsxCell', () => {
  it('turns money into a numeric major-unit value', () => {
    expect(reportXlsxCell('money', 4500)).toEqual({ type: 'number', value: 45 });
  });

  it('turns percent + number into numeric cells and text/date into strings', () => {
    expect(reportXlsxCell('percent', 42.55)).toEqual({ type: 'number', value: 42.6 });
    expect(reportXlsxCell('number', 12)).toEqual({ type: 'number', value: 12 });
    expect(reportXlsxCell('text', 'Yoga')).toEqual({ type: 'text', value: 'Yoga' });
    expect(reportXlsxCell('date', '2026-06-01')).toEqual({ type: 'text', value: '2026-06-01' });
  });

  it('renders null as an empty text cell', () => {
    expect(reportXlsxCell('money', null)).toEqual({ type: 'text', value: '' });
  });
});

describe('reportXlsxRow', () => {
  it('maps each column to a typed cell', () => {
    const columns: ReportColumn[] = [
      { key: 'class', label: 'Class', type: 'text' },
      { key: 'rate', label: 'Rate', type: 'percent' },
    ];
    expect(reportXlsxRow(columns, { class: 'Spin', rate: 80 })).toEqual([
      { type: 'text', value: 'Spin' },
      { type: 'number', value: 80 },
    ]);
  });
});
