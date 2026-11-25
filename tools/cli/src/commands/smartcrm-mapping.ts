import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CommandError } from '../output';

const id = z.string().regex(/^\d+$/);
const text = z.string().nullable();
const count = z.number().int().nonnegative().max(2147483647);
const money = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .refine((v) => Number(v) <= 21474836.47);
const signedMoney = z
  .string()
  .regex(/^-?\d+(?:\.\d{1,2})?$/)
  .refine((v) => Math.abs(Number(v)) <= 21474836.47);
const date = z.string().refine((v) => {
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.test(
      v,
    )
  )
    return false;
  const day = new Date(`${v.slice(0, 10)}T00:00:00Z`);
  return (
    Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === v.slice(0, 10) &&
    Number.isFinite(instant(v).getTime())
  );
}, 'Expected ISO date');
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .nullable();
const ref = id.nullable();
const percent = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .pipe(z.number().min(0).max(100));
const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const named = z.object({ sourceId: id, name: z.string().min(1) });
const raw = z.record(z.unknown());
export const smartCrmSchema = z.object({
  gym: z.object({
    name: z.string(),
    branch: z.string().min(1),
    timezone: z.literal('Asia/Tbilisi'),
    currency: z.literal('GEL'),
  }),
  paymentTypes: z.array(named),
  discounts: z.array(named.extend({ percent, active: z.boolean(), endDate: date.nullable() })),
  services: z.array(named),
  packages: z.array(
    named.extend({
      price: money,
      visitCount: count,
      daysCount: count,
      active: z.boolean(),
      visible: z.boolean(),
      smsName: text,
      totalPauseDays: count,
      catalogEndDate: date.nullable(),
      comment: text.optional(),
      lines: z.array(
        z.object({
          serviceSourceId: ref,
          serviceName: z.string(),
          startTime: time,
          endTime: time,
          visitCount: count,
          price: money,
          schedule: z
            .array(
              z.object({
                day: z.number().int().min(1).max(7),
                active: z.boolean(),
                start: time,
                end: time,
              }),
            )
            .default([]),
        }),
      ),
    }),
  ),
  staff: z.array(
    named.extend({ username: text, roleName: z.string(), phone: text, active: z.boolean() }),
  ),
  clients: z.array(
    z.object({
      sourceId: id,
      fullName: z.string().min(1),
      idNumber: text,
      phone: text,
      email: text,
      birthDate: date.nullable(),
      registeredAt: date,
      active: z.boolean(),
      smsEnabled: z.boolean(),
      blacklisted: z.boolean(),
      comment: text,
      deviceId: text.optional(),
      trainerStaffSourceId: ref,
      cards: z.array(
        z.object({
          sourceId: id,
          number: z.string(),
          activeInDevice: z.boolean(),
          price: money,
          paidAmount: money,
          paymentTypeSourceId: ref,
          recordedAt: date.nullable(),
        }),
      ),
    }),
  ),
  soldPackages: z.array(
    z.object({
      sourceId: id,
      clientSourceId: id,
      packageSourceId: id,
      price: money,
      paidAmount: money,
      discountPercent: percent,
      saleTypeSourceId: ref,
      paymentTypeSourceId: ref,
      creatorStaffSourceId: ref,
      visitsLeft: count,
      visitsCount: count,
      endDate: date.nullable(),
      soldAt: date,
      expired: z.boolean(),
      pauseStatus: z.union([z.boolean(), z.string(), z.number()]),
      pauseStartDate: date.nullable(),
      pauseEndDate: date.nullable(),
      remainingPause: z
        .union([count, z.string().regex(/^\d+$/).transform(Number).pipe(count)])
        .nullable(),
      activationDate: date.nullable(),
      activationStatus: z.union([z.boolean(), z.string(), z.number()]),
    }),
  ),
  visits: z.array(
    z.object({ clientSourceId: id, checkInAt: date, checkOutAt: date.nullable(), service: text }),
  ),
  groups: z.array(named.extend({ maxClients: count.nullable(), active: z.boolean() })),
  workouts: z.array(
    z.object({
      sourceId: id,
      groupSourceId: id,
      groupName: text,
      trainerStaffSourceId: ref,
      title: z.string(),
      startsAt: date,
      durationMinutes: count.refine((v) => v > 0),
      capacity: count.nullable(),
      recurrenceType: z.literal('weekly'),
      recurrenceDays: z.array(weekday).min(1),
      weeklyTimes: z.record(weekday, time),
      recurrenceEndsAt: date.nullable(),
      active: z.boolean(),
      raw,
    }),
  ),
  sessions: z.array(
    z.object({
      sourceId: id,
      workoutSourceId: id,
      title: z.string(),
      start: date,
      end: date,
      capacity: count.refine((v) => v > 0),
      bookedCount: count,
      cancelled: z.boolean(),
    }),
  ),
  shopSales: z
    .array(
      z.object({
        sourceId: id,
        soldAt: date,
        staffSourceId: ref,
        paymentTypeSourceId: ref,
        total: signedMoney,
        lines: z
          .array(
            z.object({
              sourceId: id,
              productSourceId: id,
              productName: z.string(),
              quantity: z.number().positive().max(2147483647),
              unitPrice: money,
              amount: signedMoney,
              discountPercent: percent.nullable(),
            }),
          )
          .min(1),
      }),
    )
    .optional(),
  products: z.array(
    named.extend({
      barcode: text,
      purchasePrice: money,
      salePrice: money,
      stock: z.number().int(),
      active: z.boolean(),
    }),
  ),
});
export type SmartCrmData = z.infer<typeof smartCrmSchema>;
export const SECTIONS = [
  'gym',
  'staff',
  'clients',
  'packages',
  'soldPackages',
  'cardSales',
  'shopSales',
  'visits',
  'groups',
  'workouts',
  'sessions',
  'products',
  'discounts',
  'paymentTypes',
  'services',
] as const;
export type Section = (typeof SECTIONS)[number];

export function parseSmartCrm(input: string): SmartCrmData {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new CommandError('Invalid JSON input', { code: 'BAD_IMPORT' });
  }
  const parsed = smartCrmSchema.safeParse(value);
  if (!parsed.success) {
    // Never include values or Zod messages (enum messages can echo input) in diagnostics.
    throw new CommandError('Invalid Smart CRM input', {
      code: 'BAD_IMPORT',
      detail: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
  }
  const data = parsed.data;
  for (const section of SECTIONS) {
    if (section === 'gym' || section === 'visits' || section === 'cardSales') continue;
    const seen = new Set<string>();
    for (const row of data[section] ?? []) {
      if (seen.has(row.sourceId))
        throw new CommandError(`Duplicate sourceId in ${section}`, {
          code: 'BAD_IMPORT',
          detail: { sourceId: row.sourceId },
        });
      seen.add(row.sourceId);
    }
  }
  const cardIds = new Set<string>();
  for (const client of data.clients)
    for (const card of client.cards) {
      if (cardIds.has(card.sourceId))
        throw new CommandError('Duplicate card sourceId', { code: 'BAD_IMPORT' });
      cardIds.add(card.sourceId);
    }
  const products = new Set(data.products.map((p) => p.sourceId));
  for (const sale of data.shopSales ?? []) {
    const lineIds = new Set<string>();
    for (const line of sale.lines) {
      if (!products.has(line.productSourceId) || lineIds.has(line.sourceId))
        throw new CommandError('Invalid shop sale line reference', { code: 'BAD_IMPORT' });
      lineIds.add(line.sourceId);
    }
    if (
      sale.lines.reduce((sum, line) => sum + minorUnits(line.amount), 0) !== minorUnits(sale.total)
    )
      throw new CommandError('Shop sale total differs from lines', { code: 'BAD_IMPORT' });
  }
  const clients = new Set(data.clients.map((r) => r.sourceId));
  const packages = new Set(data.packages.map((r) => r.sourceId));
  for (const row of data.soldPackages) {
    if (!clients.has(row.clientSourceId) || !packages.has(row.packageSourceId))
      throw new CommandError('Unresolved soldPackages reference', {
        code: 'BAD_IMPORT',
        detail: { sourceId: row.sourceId },
      });
  }
  for (const [index, row] of data.visits.entries()) {
    if (!clients.has(row.clientSourceId))
      throw new CommandError('Unresolved visits reference', {
        code: 'BAD_IMPORT',
        detail: { index },
      });
  }
  const workouts = new Set(data.workouts.map((w) => w.sourceId));
  const groups = new Set(data.groups.map((g) => g.sourceId));
  for (const row of data.workouts) {
    if (!groups.has(row.groupSourceId))
      throw new CommandError('Unresolved workout group', {
        code: 'BAD_IMPORT',
        detail: { sourceId: row.sourceId },
      });
    if (
      row.raw.RecurrenceInterval !== undefined &&
      row.raw.RecurrenceInterval !== 1 &&
      row.raw.RecurrenceInterval !== '1'
    )
      throw new CommandError('Unsupported recurrence interval', {
        code: 'BAD_IMPORT',
        detail: { sourceId: row.sourceId },
      });
  }
  for (const row of data.sessions) {
    if (!workouts.has(row.workoutSourceId))
      throw new CommandError('Unresolved session workout', {
        code: 'BAD_IMPORT',
        detail: { sourceId: row.sourceId },
      });
    if (instant(row.end) <= instant(row.start))
      throw new CommandError('Session end must follow start', {
        code: 'BAD_IMPORT',
        detail: { sourceId: row.sourceId },
      });
  }
  return data;
}

export function sourceId(slug: string, kind: string, source: string): string {
  return `scrm_${slug}_${kind}_${createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}
export function minorUnits(value: string): number {
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  return (value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(fraction.padEnd(2, '0')));
}
/** Offset-less source timestamps are Tbilisi wall time, never the host timezone. */
export function instant(value: string): Date {
  return new Date(
    value.length === 10
      ? `${value}T00:00:00+04:00`
      : /(?:Z|[+-]\d\d:\d\d)$/.test(value)
        ? value
        : `${value}+04:00`,
  );
}
export function syntheticEmail(slug: string, kind: string, source: string): string {
  return `${sourceId(slug, kind, source)}@no-login.fit.local`;
}
export function staffRole(value: string): 'TRAINER' | 'RECEPTIONIST' | 'MANAGER' | null {
  if (/მწვრთნელი|trainer/i.test(value)) return 'TRAINER';
  if (/რესეფშენი|reception/i.test(value)) return 'RECEPTIONIST';
  if (/ადმინისტრატორი|მენეჯერი|admin|manager/i.test(value)) return 'MANAGER';
  return null;
}
export function paymentMethod(value: string): 'CASH' | 'CARD' | 'BANK_TRANSFER' | null {
  if (/^(cash|ნაღდი|ნაღდი ანგარიშსწორება)$/i.test(value.trim())) return 'CASH';
  // Card terminals and the Flitt online card gateway.
  if (/terminal|ტერმინალ|^flitt$/i.test(value.trim())) return 'CARD';
  // 'გადმორიცხვა' is how the source names a bank transfer ('BOG გადმორიცხვა').
  if (/bank transfer|გადარიცხვა|გადმორიცხვა/i.test(value)) return 'BANK_TRANSFER';
  // Instalment plans ('თბს განაწილება', 'ნაწილ ნაწილი …', 'ნაწილ-ნაწილ'): the money the
  // source counts as received reaches the gym's account, not its till or terminal.
  if (/instal+ment|განაწილება|ნაწილ[ -]ნაწილ/i.test(value)) return 'BANK_TRANSFER';
  return null;
}
/** Visit rows have no source id: preserve identical rows with a stable occurrence ordinal. */
export function visitIds(slug: string, rows: SmartCrmData['visits']): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = JSON.stringify([
      row.clientSourceId,
      instant(row.checkInAt).toISOString(),
      row.checkOutAt,
      row.service,
    ]);
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    return sourceId(slug, 'visit', `${key}:${ordinal}`);
  });
}

/** Split per-day wall times into independent weekly rules; preserve differing Saturday times. */
export function workoutRules(
  workout: SmartCrmData['workouts'][number],
): Array<{ day: string; startTime: string; rrule: string }> {
  const days = { mon: 'MO', tue: 'TU', wed: 'WE', thu: 'TH', fri: 'FR', sat: 'SA', sun: 'SU' };
  const fallback = new Date(instant(workout.startsAt).getTime() + 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(11, 16);
  return [...new Set(workout.recurrenceDays)].map((day) => ({
    day,
    startTime: workout.weeklyTimes[day]?.slice(0, 5) ?? fallback,
    rrule: `FREQ=WEEKLY;BYDAY=${days[day]}`,
  }));
}
export function localWeekday(value: string): string {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    new Date(instant(value).getTime() + 4 * 60 * 60 * 1000).getUTCDay()
  ]!;
}

/** Treat a source expiry date as inclusive through the final Tbilisi millisecond. */
export function tbilisiEndOfDay(value: string): Date {
  const day =
    value.length === 10
      ? value
      : new Date(instant(value).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${day}T23:59:59.999+04:00`);
}
export function packageSubscriptionDetails(pkg: SmartCrmData['packages'][number]) {
  const weekdays = [
    'ორშაბათი',
    'სამშაბათი',
    'ოთხშაბათი',
    'ხუთშაბათი',
    'პარასკევი',
    'შაბათი',
    'კვირა',
  ];
  const features = [
    `ვიზიტების ლიმიტი: ${pkg.visitCount}`,
    `მოქმედების ვადა: ${pkg.daysCount} დღე`,
    `შეჩერების ლიმიტი: ${pkg.totalPauseDays} დღე`,
  ];
  for (const line of pkg.lines) {
    for (const slot of line.schedule) {
      features.push(
        `${line.serviceName} — ${weekdays[slot.day - 1]}: ${slot.active ? `${slot.start ?? '—'}–${slot.end ?? '—'}` : 'წვდომა გამორთულია'}`,
      );
    }
    if (!line.schedule.length && (line.startTime || line.endTime))
      features.push(`${line.serviceName}: ${line.startTime ?? '—'}–${line.endTime ?? '—'}`);
  }
  features.push('ვიზიტების ბალანსი და წვდომის საათები სისტემაში ავტომატურად არ კონტროლდება.');
  return {
    interval: pkg.daysCount >= 300 ? ('YEAR' as const) : ('MONTH' as const),
    features,
    description: features.join('\n'),
  };
}
export function soldSubscriptionDetails(
  sale: SmartCrmData['soldPackages'][number],
  pkg: SmartCrmData['packages'][number],
) {
  if (!sale.endDate)
    throw new CommandError('Sold package requires an expiry date', {
      code: 'BAD_IMPORT',
      detail: { sourceId: sale.sourceId },
    });
  const frozen = !sale.expired && sale.pauseStatus === true;
  // An open-ended pause has no end date in the source; staff resume it by hand.
  return {
    priceAmount: minorUnits(sale.paidAmount),
    currency: 'GEL',
    interval: packageSubscriptionDetails(pkg).interval,
    currentPeriodStart: instant(sale.activationDate ?? sale.soldAt),
    currentPeriodEnd: tbilisiEndOfDay(sale.endDate),
    cancelAtPeriodEnd: true,
    provider: 'smartcrm-import',
    createdAt: instant(sale.soldAt),
    status: sale.expired
      ? ('EXPIRED' as const)
      : frozen
        ? ('FROZEN' as const)
        : ('ACTIVE' as const),
    frozenAt: frozen ? instant(sale.pauseStartDate ?? sale.soldAt) : null,
    frozenUntil: frozen && sale.pauseEndDate ? instant(sale.pauseEndDate) : null,
  };
}

export interface ImportWarning {
  section: Section;
  code: string;
  sourceId?: string;
}
export function aggregateWarnings(warnings: ImportWarning[]) {
  const result = new Map<
    string,
    { code: string; count: number; sourceIds: string[]; sections: Section[] }
  >();
  for (const warning of warnings) {
    const entry = result.get(warning.code) ?? {
      code: warning.code,
      count: 0,
      sourceIds: [],
      sections: [],
    };
    entry.count++;
    if (!entry.sections.includes(warning.section)) entry.sections.push(warning.section);
    if (
      warning.sourceId &&
      entry.sourceIds.length < 5 &&
      !entry.sourceIds.includes(warning.sourceId)
    )
      entry.sourceIds.push(warning.sourceId);
    result.set(warning.code, entry);
  }
  return [...result.values()];
}

/** Keep every expired sale and one live sale per person; never depend on file order. */
export function selectSubscriptionSales<
  T extends Pick<
    SmartCrmData['soldPackages'][number],
    'sourceId' | 'clientSourceId' | 'expired' | 'endDate' | 'soldAt'
  > & { activationDate?: string | null },
>(sales: T[], now = new Date()): { selected: T[]; noteOnly: T[]; deferred: T[] } {
  const live = new Map<string, T>();
  const inForce = (sale: T) =>
    !sale.expired &&
    instant(sale.activationDate ?? sale.soldAt) <= now &&
    !!sale.endDate &&
    tbilisiEndOfDay(sale.endDate) >= now;
  const rank = (a: T, b: T) => {
    if (!a.endDate || !b.endDate)
      throw new CommandError('Live sale requires an expiry date', { code: 'BAD_IMPORT' });
    return (
      Number(inForce(a)) - Number(inForce(b)) ||
      tbilisiEndOfDay(a.endDate).getTime() - tbilisiEndOfDay(b.endDate).getTime() ||
      instant(a.soldAt).getTime() - instant(b.soldAt).getTime() ||
      a.sourceId.localeCompare(b.sourceId, 'en')
    );
  };
  for (const sale of sales) {
    if (sale.expired) continue;
    if (!sale.endDate)
      throw new CommandError('Live sale requires an expiry date', {
        code: 'BAD_IMPORT',
        detail: { sourceId: sale.sourceId },
      });
    const current = live.get(sale.clientSourceId);
    if (!current || rank(sale, current) > 0) live.set(sale.clientSourceId, sale);
  }
  return {
    selected: sales.filter(
      (sale) => sale.expired || live.get(sale.clientSourceId)?.sourceId === sale.sourceId,
    ),
    deferred: sales.filter((sale) => {
      const chosen = live.get(sale.clientSourceId);
      return (
        !sale.expired &&
        !!chosen &&
        inForce(chosen) &&
        instant(sale.activationDate ?? sale.soldAt) > now
      );
    }),
    noteOnly: sales.filter(
      (sale) => !sale.expired && live.get(sale.clientSourceId)?.sourceId !== sale.sourceId,
    ),
  };
}

/**
 * Human-readable texts for the fields staff actually read in the console. Source
 * facts our models have no column for live here as plain Georgian lines — never as
 * serialized JSON, which the console would show verbatim.
 */
const lari = (value: string | null | undefined) => (value ? `${value} ₾` : '—');
const dayOf = (value: string | null | undefined) => (value ? value.slice(0, 10) : '—');

export function clientNoteText(
  client: SmartCrmData['clients'][number],
  trainerName: string | null,
): string {
  const lines = ['Smart CRM-დან გადმოტანილი მონაცემები'];
  if (client.comment) lines.push(`კომენტარი: ${client.comment}`);
  if (trainerName) lines.push(`ტრენერი: ${trainerName}`);
  for (const card of client.cards) {
    if (card.number)
      lines.push(`ბარათი: ${card.number}${card.activeInDevice ? '' : ' (გათიშული)'}`);
  }
  if (client.deviceId) lines.push(`ტურნიკეტის ID: ${client.deviceId}`);
  if (client.smsEnabled === false) lines.push('SMS გამორთულია');
  if (client.blacklisted) lines.push('შავ სიაშია');
  return lines.join('\n');
}

export function saleNoteText(
  sale: SmartCrmData['soldPackages'][number],
  packageName: string,
  paymentType: string | null,
  discountName: string | null,
): string {
  const status = sale.pauseStatus ? 'დაპაუზებული' : sale.expired ? 'ვადაგასული' : 'მოქმედი';
  const lines = [
    `პაკეტი: ${packageName} (${status})`,
    `გაყიდვის თარიღი: ${dayOf(sale.soldAt)} · ვადა: ${dayOf(sale.endDate)}`,
    `ვიზიტები: დარჩენილი ${sale.visitsLeft ?? '—'} / ${sale.visitsCount ?? '—'}`,
    `ფასი: ${lari(sale.price)} · გადახდილი: ${lari(sale.paidAmount)}`,
  ];
  if (discountName && Number(sale.discountPercent) > 0)
    lines.push(`ფასდაკლება: ${discountName} (${sale.discountPercent}%)`);
  if (paymentType) lines.push(`გადახდის ტიპი: ${paymentType}`);
  if (sale.pauseStatus)
    lines.push(`პაუზა: ${dayOf(sale.pauseStartDate)} – ${dayOf(sale.pauseEndDate)}`);
  return lines.join('\n');
}

export function productDescriptionText(product: SmartCrmData['products'][number]): string {
  return product.barcode ? `შტრიხკოდი: ${product.barcode}` : '';
}

/** Compare only explicitly supplied source columns, preserving DB-owned fields. */
export function sourceChanges<T extends object>(existing: object, desired: T): Partial<T> {
  const before = existing as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(desired).filter(
      ([key, value]) =>
        value !== undefined && JSON.stringify(before[key]) !== JSON.stringify(value),
    ),
  ) as Partial<T>;
}

export function isLiveSubscription(status: string): boolean {
  return ['ACTIVE', 'FROZEN', 'PAST_DUE', 'TRIAL'].includes(status);
}

/** Only source-owned live subscriptions and source-owned members may be expired. */
export function isRemovedImportedSubscription(
  row: { id: string; memberId: string; provider: string; status: string },
  prefix: string,
  currentIds: ReadonlySet<string>,
): boolean {
  return (
    row.id.startsWith(`${prefix}subscription_`) &&
    row.memberId.startsWith(`${prefix}client_`) &&
    row.provider === 'smartcrm-import' &&
    !currentIds.has(row.id) &&
    isLiveSubscription(row.status)
  );
}

/** A displaced imported sale stays as history; a native live entitlement wins. */
export function syncSaleDisposition(selected: boolean, nativeLive: boolean, existed: boolean) {
  if (selected && !nativeLive) return 'source' as const;
  return existed ? ('expired' as const) : ('note-only' as const);
}

/** Existing immutable payments win over a newer export, including their status and date. */
export function monthlyPayments(
  planned: Array<{ id: string; amount: number; createdAt: Date; status: string }>,
  existing: Array<{ id: string; amount: number; createdAt: Date; status: string }>,
  timezone: string,
) {
  const rows = new Map(planned.map((row) => [row.id, row]));
  for (const row of existing) rows.set(row.id, row);
  const months = new Map<string, { payments: number; amountMinor: number }>();
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  for (const row of rows.values()) {
    if (row.status !== 'CAPTURED') continue;
    const parts = formatter.formatToParts(row.createdAt);
    const month = `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
    const total = months.get(month) ?? { payments: 0, amountMinor: 0 };
    total.payments++;
    total.amountMinor += row.amount;
    months.set(month, total);
  }
  return [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({
      month,
      ...total,
      amount: (total.amountMinor / 100).toFixed(2),
    }));
}

export function shopItemQuantity(quantity: number): number {
  return Math.max(1, Math.round(quantity));
}
