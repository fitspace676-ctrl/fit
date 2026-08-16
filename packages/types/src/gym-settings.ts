// @fit/types — gym settings contracts (brand, locale, business hours, policies).
//
// Shapes crossing the API boundary for the staff console's gym-configuration
// page (T4.8): `GET /gyms/settings`, `PATCH /gyms/settings`, and the logo
// finaliser `POST /gyms/settings/logo`. The API validates inbound bodies with
// these Zod schemas and the admin client reuses the inferred types so the
// request/response contract never drifts between sender and receiver.
//
// Settings live in a single JSON column on the `Gym` row. The gym's display
// `name` is the one field NOT stored here: it stays on `Gym.name` (the canonical
// name rosters and the public lookup already read), surfaced as `brand.name` in
// the response and written through to `Gym.name` when `brand.name` is PATCHed —
// so there is exactly one source of truth for the name.

import { z } from 'zod';
import { locationHoursSchema, type LocationHours } from './locations-admin';
import { paymentMethodSchema, type PaymentMethod } from './orders';

/**
 * The gym's default business hours — the same seven-day shape a location's
 * opening hours use (T4.5), so the form and the public projection agree. A
 * location inherits these as the base it can then override per branch.
 */
export const weeklyHoursSchema = locationHoursSchema;

/** The gym's default weekly business hours — {@link weeklyHoursSchema}. */
export type WeeklyHours = LocationHours;

/** A six-digit hex colour, e.g. `#4f46e5`. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_MESSAGE = 'Color must be a hex value like #4f46e5';

/** Default brand colours for a gym that has not customised them yet. */
export const DEFAULT_PRIMARY_COLOR = '#4f46e5';
export const DEFAULT_SECONDARY_COLOR = '#0f172a';

/** Locale defaults — the platform serves a Georgia-first audience (fit.ge). */
export const DEFAULT_LANGUAGE = 'en';
export const DEFAULT_CURRENCY = 'GEL';
export const DEFAULT_TIMEZONE = 'Asia/Tbilisi';

/** Largest logo width (px) accepted; the admin form rejects anything wider. */
export const GYM_LOGO_MAX_WIDTH = 1000;

/**
 * Default class-cancellation cutoff (hours before an occurrence starts).
 * `0` means *no* cutoff — a member may cancel right up to the start — so the
 * policy is opt-in: a gym sets a positive value to start enforcing it.
 */
export const DEFAULT_CANCELLATION_CUTOFF_HOURS = 0;

/**
 * Largest cancellation cutoff a gym can set (hours) — one week. A ceiling keeps
 * the value sane (a cutoff longer than the booking window would freeze every
 * booking the moment it is made) and bounds what is stored / rendered.
 */
export const MAX_CANCELLATION_CUTOFF_HOURS = 168;

/** The interface languages a gym can default its members' experience to. */
export const gymLanguageSchema = z.enum(['en', 'ka', 'ru']);

/** A supported interface language — a member of {@link gymLanguageSchema}. */
export type GymLanguage = z.infer<typeof gymLanguageSchema>;

/** The supported language codes, for rendering the locale select. */
export const SUPPORTED_LANGUAGES = gymLanguageSchema.options;

/** Human labels for each supported language, for the locale select. */
export const LANGUAGE_LABELS: Record<GymLanguage, string> = {
  en: 'English',
  ka: 'Georgian',
  ru: 'Russian',
};

/**
 * True when `tz` is an IANA time-zone the runtime recognises. Used to validate
 * the stored timezone so a typo can never break a downstream `formatDate` that
 * trusts it. `Intl.DateTimeFormat` throws a `RangeError` for an unknown zone.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The brand fields stored in the settings JSON. `name` is deliberately absent —
 * it lives on `Gym.name` (see the file header). `logoUrl` is the R2 public URL
 * of the uploaded logo (or `null`); the colours drive client + email theming and
 * default to the platform palette so a brand is always renderable.
 */
export const gymBrandSettingsSchema = z.object({
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z
    .string()
    .regex(HEX_COLOR_PATTERN, HEX_COLOR_MESSAGE)
    .default(DEFAULT_PRIMARY_COLOR),
  secondaryColor: z
    .string()
    .regex(HEX_COLOR_PATTERN, HEX_COLOR_MESSAGE)
    .default(DEFAULT_SECONDARY_COLOR),
});

/** The stored brand fields — {@link gymBrandSettingsSchema}. */
export type GymBrandSettings = z.infer<typeof gymBrandSettingsSchema>;

/**
 * Locale settings: the default interface `language`, the `currency` member-facing
 * prices render in (ISO-4217 three-letter code), and the `timezone` every
 * displayed time is localised to. Each defaults so a never-configured gym still
 * returns a complete, sensible locale.
 */
export const gymLocaleSchema = z.object({
  language: gymLanguageSchema.default(DEFAULT_LANGUAGE),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code, e.g. GEL')
    .default(DEFAULT_CURRENCY),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').default(DEFAULT_TIMEZONE),
});

/** The gym's locale settings — {@link gymLocaleSchema}. */
export type GymLocale = z.infer<typeof gymLocaleSchema>;

/** Penalty amount interpretation shared by the cancellation + no-show policies. */
export const penaltyTypeSchema = z.enum(['fixed', 'percentage']);

/** A penalty amount interpretation — a member of {@link penaltyTypeSchema}. */
export type PenaltyType = z.infer<typeof penaltyTypeSchema>;

/** Default penalty interpretation — a flat, fixed amount. */
export const DEFAULT_PENALTY_TYPE: PenaltyType = 'fixed';

/** How a freed waitlist seat is offered: auto-promoted, or held for staff. */
export const waitlistModeSchema = z.enum(['auto', 'manual']);

/** A waitlist-promotion mode — a member of {@link waitlistModeSchema}. */
export type WaitlistMode = z.infer<typeof waitlistModeSchema>;

/** Largest late/no-show/guest/trial money amount a gym can configure. */
export const MAX_PENALTY_AMOUNT = 100_000;

/**
 * Booking + cancellation policy: how the class-booking flow (T5.4–T5.6) behaves
 * for this gym. `cancellationCutoffHours` is the window before an occurrence's
 * start within which a member may no longer release a confirmed seat (T5.6) — `0`
 * disables it (cancel allowed up to the start); leaving a *waitlist* is always
 * permitted regardless, since it holds no seat. The remaining fields deepen the
 * policy for gym-admin parity (T12.16): the late-cancellation `lateCancellation*`
 * penalty applied inside the cutoff, the `bookingWindowDays` a member may book
 * ahead, per-day / per-week booking caps (`0` = unlimited), and how a freed
 * waitlist seat is offered. Every field defaults so a never-configured gym parses
 * to a complete, permissive (cutoff-free, uncapped) policy.
 */
export const gymBookingSettingsSchema = z.object({
  cancellationCutoffHours: z
    .number()
    .int()
    .min(0)
    .max(MAX_CANCELLATION_CUTOFF_HOURS)
    .default(DEFAULT_CANCELLATION_CUTOFF_HOURS),
  lateCancellationPenalty: z.number().min(0).max(MAX_PENALTY_AMOUNT).default(0),
  lateCancellationPenaltyType: penaltyTypeSchema.default(DEFAULT_PENALTY_TYPE),
  bookingWindowDays: z.number().int().min(0).max(365).default(14),
  maxBookingsPerDay: z.number().int().min(0).max(100).default(0),
  maxBookingsPerWeek: z.number().int().min(0).max(500).default(0),
  waitlistMode: waitlistModeSchema.default('auto'),
});

/** The gym's booking + cancellation policy — {@link gymBookingSettingsSchema}. */
export type GymBookingSettings = z.infer<typeof gymBookingSettingsSchema>;

/**
 * Business information shown on receipts, invoices, and the member-portal contact
 * surface. All nullable — an unset field simply isn't rendered. The gym's `name`
 * is the canonical `Gym.name`, surfaced under `brand`, and is not duplicated here.
 */
export const gymBusinessSettingsSchema = z.object({
  address: z.string().trim().max(200).nullable().default(null),
  phone: z.string().trim().max(40).nullable().default(null),
  email: z.string().email().nullable().default(null),
  website: z.string().trim().max(200).nullable().default(null),
});

/** The gym's business information — {@link gymBusinessSettingsSchema}. */
export type GymBusinessSettings = z.infer<typeof gymBusinessSettingsSchema>;

/**
 * No-show policy: the `penalty` for missing a booked class (interpreted by
 * `penaltyType`), the `penaltyDays` it applies for, and the `autoCancelMinutes`
 * grace after a class starts before an un-checked-in booking is released
 * (`0` = never auto-cancel). Config only; defaults impose nothing.
 */
export const gymNoShowSettingsSchema = z.object({
  penalty: z.number().min(0).max(MAX_PENALTY_AMOUNT).default(0),
  penaltyType: penaltyTypeSchema.default(DEFAULT_PENALTY_TYPE),
  penaltyDays: z.number().int().min(0).max(365).default(0),
  autoCancelMinutes: z.number().int().min(0).max(240).default(0),
});

/** The gym's no-show policy — {@link gymNoShowSettingsSchema}. */
export type GymNoShowSettings = z.infer<typeof gymNoShowSettingsSchema>;

/**
 * Membership freeze (pause) policy, read by the freeze flow (T5.x / T8.4) that
 * enforces it: `minFreezeDays` / `maxFreezeDays` bound a single freeze's length
 * (`0` on either means no per-freeze limit at that end), `maxFreezeDaysPerYear`
 * bounds the annual total (`0` = no annual cap), `freezeFee` is charged per
 * freeze, and `requiresApproval` gates member-initiated freezes on staff sign-off.
 * Defaults are permissive so an unconfigured gym imposes no gym-level limit beyond
 * the plan's own allowance.
 */
export const gymFreezeSettingsSchema = z.object({
  minFreezeDays: z.number().int().min(0).max(365).default(0),
  maxFreezeDays: z.number().int().min(0).max(365).default(0),
  maxFreezeDaysPerYear: z.number().int().min(0).max(365).default(0),
  freezeFee: z.number().min(0).max(MAX_PENALTY_AMOUNT).default(0),
  requiresApproval: z.boolean().default(false),
});

/** The gym's freeze policy — {@link gymFreezeSettingsSchema}. */
export type GymFreezeSettings = z.infer<typeof gymFreezeSettingsSchema>;

/**
 * Guest-pass rules: passes granted per member per month (`0` disables guest
 * passes), the `price`, how many `durationDays` a pass is valid, waiver /
 * accompaniment requirements, and a `sameGuestCooldownDays` before the same guest
 * may return.
 */
export const gymGuestPassSettingsSchema = z.object({
  passesPerMonth: z.number().int().min(0).max(100).default(0),
  price: z.number().min(0).max(MAX_PENALTY_AMOUNT).default(0),
  durationDays: z.number().int().min(1).max(30).default(1),
  requiresWaiver: z.boolean().default(true),
  mustBeAccompanied: z.boolean().default(true),
  sameGuestCooldownDays: z.number().int().min(0).max(365).default(0),
});

/** The gym's guest-pass rules — {@link gymGuestPassSettingsSchema}. */
export type GymGuestPassSettings = z.infer<typeof gymGuestPassSettingsSchema>;

/**
 * Trial-membership rules: `durationDays` (`0` disables trials), `price`, whether
 * classes are `includesClasses` and how many `maxClassBookings` may be booked,
 * whether a payment method is `requiresPaymentMethod` up front, and the
 * `conversionDiscountPercent` off the first paid period on conversion.
 */
export const gymTrialSettingsSchema = z.object({
  durationDays: z.number().int().min(0).max(365).default(0),
  price: z.number().min(0).max(MAX_PENALTY_AMOUNT).default(0),
  includesClasses: z.boolean().default(true),
  maxClassBookings: z.number().int().min(0).max(100).default(0),
  requiresPaymentMethod: z.boolean().default(false),
  conversionDiscountPercent: z.number().min(0).max(100).default(0),
});

/** The gym's trial-membership rules — {@link gymTrialSettingsSchema}. */
export type GymTrialSettings = z.infer<typeof gymTrialSettingsSchema>;

/**
 * Which inputs the member-create form asks for — the admin-console Add-Member drawer
 * and the POS till's, which are the same form reading this same config.
 *
 * A field that is **on** is shown *and* required; a field that is off is not shown
 * at all. There is no third state where the desk is offered a box it may ignore,
 * because that is the state that produced rosters full of half-filled profiles at
 * gyms that had deliberately switched the field on. {@link requiredIntakeFields}
 * derives the mandatory set (and names the handful of exemptions); the create form
 * and the API both enforce it from there.
 *
 * `name`/`email` are required by `createMemberSchema` regardless, so they default on
 * (the Settings UI warns when they are turned off). `surname` is a UI-only split
 * joined onto `name`; `startDate` is intentionally absent (removed from the drawer —
 * the API defaults enrolment to today).
 *
 * The identity and contact fields default **on**: a gym that registers someone
 * without a date of birth, a national id or a next of kin generally wanted them and
 * had no prompt to ask, and the edit form has always shown all of them anyway. A gym
 * that wants a leaner desk turns them off — which is the cheap direction, because
 * chasing a member later for data you never asked for is the expensive one.
 *
 * Still off by default: `medicalNotes` (health data — worth an explicit decision
 * rather than collecting it because a form offered the box), `paymentMethod`, and
 * the `surname` split.
 */
export const gymMemberIntakeSettingsSchema = z.object({
  name: z.boolean().default(true),
  surname: z.boolean().default(false),
  email: z.boolean().default(true),
  phone: z.boolean().default(true),
  gender: z.boolean().default(true),
  dateOfBirth: z.boolean().default(true),
  /**
   * National identity number. Independent of the public join wizard, which always
   * requires one.
   */
  personalId: z.boolean().default(true),
  address: z.boolean().default(true),
  emergencyContact: z.boolean().default(true),
  membershipPlan: z.boolean().default(true),
  paymentMethod: z.boolean().default(false),
  medicalNotes: z.boolean().default(false),
});

/** The Add-Member drawer field-visibility config — {@link gymMemberIntakeSettingsSchema}. */
export type GymMemberIntakeSettings = z.infer<typeof gymMemberIntakeSettingsSchema>;

/** One member-intake toggle — a key of {@link gymMemberIntakeSettingsSchema}. */
export type MemberIntakeField = keyof GymMemberIntakeSettings;

/**
 * The intake toggles that are visibility-only: switching them on shows the input
 * but never makes it mandatory.
 *
 * `name`/`email` because {@link createMemberSchema} already requires them — they
 * are the member's identity, not a configurable extra. `membershipPlan` and
 * `paymentMethod` because both live in the enrolment block the POS till hides
 * structurally (at the till the enrolment *is* the cart), so requiring a field
 * its operator cannot see would make creating a walk-in impossible — and "no plan
 * yet" is a legitimate state for one anyway.
 */
const ALWAYS_OPTIONAL_INTAKE_FIELDS = [
  'name',
  'email',
  'membershipPlan',
  'paymentMethod',
] as const satisfies readonly MemberIntakeField[];

/**
 * Which fields a member-create must actually supply, given the gym's toggles.
 *
 * This is the single statement of the "on means required" policy: the admin form
 * marks these inputs required and the API rejects a create that omits one, both
 * by calling this — so the console and the server can never drift into disagreeing
 * about what the gym asked for.
 *
 * `surname` is included, but only the browser can act on it: the form joins it
 * onto `name` before the request is sent, so by the time the API sees the payload
 * there is no separate surname left to check.
 */
export function requiredIntakeFields(intake: GymMemberIntakeSettings): MemberIntakeField[] {
  return (Object.keys(intake) as MemberIntakeField[]).filter(
    (field) =>
      intake[field] &&
      !(ALWAYS_OPTIONAL_INTAKE_FIELDS as readonly MemberIntakeField[]).includes(field),
  );
}

/**
 * What the staff page shows — which roster columns, and which blocks of the page
 * itself.
 *
 * Unlike {@link gymMemberIntakeSettingsSchema}, nothing here is made mandatory:
 * these are display choices, not data-collection policy. On shows it, off hides it.
 *
 * Every default reproduces the page as it stands, so a gym that never opens this
 * screen sees no change. That is why the four fields the roster already carries but
 * has never rendered (`location`, `email`, `phone`, `joined`) start **off** despite
 * the data being there — surfacing them is the gym's decision, not an upgrade
 * applied to everyone.
 *
 * First name has no toggle. It is the row's identity and its click target; a roster
 * of anonymous rows is not a leaner roster.
 */
export const gymStaffDirectorySettingsSchema = z.object({
  // -- Roster columns --
  lastName: z.boolean().default(true),
  role: z.boolean().default(true),
  status: z.boolean().default(true),
  location: z.boolean().default(false),
  email: z.boolean().default(false),
  phone: z.boolean().default(false),
  joined: z.boolean().default(false),
  // -- Page blocks --
  whosWorking: z.boolean().default(true),
  roles: z.boolean().default(true),
});

/** The staff-page display config — {@link gymStaffDirectorySettingsSchema}. */
export type GymStaffDirectorySettings = z.infer<typeof gymStaffDirectorySettingsSchema>;

/** One staff-page toggle — a key of {@link gymStaffDirectorySettingsSchema}. */
export type StaffDirectoryField = keyof GymStaffDirectorySettings;

/**
 * The toggles that add a column to the roster, in the order they appear after the
 * always-present first-name column.
 */
export const STAFF_COLUMN_FIELDS = [
  'lastName',
  'role',
  'location',
  'email',
  'phone',
  'status',
  'joined',
] as const satisfies readonly StaffDirectoryField[];

/**
 * The toggles that add a block to the page: the "who's working now" card first
 * (it sits above the tabs), then the tabs in the order they are offered.
 */
export const STAFF_SECTION_FIELDS = [
  'whosWorking',
  'roles',
] as const satisfies readonly StaffDirectoryField[];

/**
 * Which reports the Reports hub offers.
 *
 * Every key is one entry of `REPORT_KEYS`; switching it off removes that report
 * from the hub's tabs and chips. It does NOT revoke access — the preview and
 * export routes keep serving a disabled report to anyone holding
 * `Permission.ReportView`, so a bookmarked link and a scheduled export both keep
 * working. Hiding a card is housekeeping; withholding a report is a permission,
 * and a toggle that half-enforced access would be worse than one that plainly
 * does not.
 *
 * All default **on**: the catalogue is the product's own list, so a gym that
 * never opens Settings sees exactly what it saw before this existed.
 *
 * Keys are the report keys verbatim rather than camel-cased, so the drift test
 * can compare this object's keys against `REPORT_KEYS` directly.
 */
export const gymReportsSettingsSchema = z.object({
  // Sales
  'sales-summary': z.boolean().default(true),
  'sales-by-payment-method': z.boolean().default(true),
  'plan-performance': z.boolean().default(true),
  'sales-by-staff': z.boolean().default(true),
  'discounts-and-promotions': z.boolean().default(true),
  'refunds-detail': z.boolean().default(true),
  'pos-transaction-log': z.boolean().default(true),
  // Members
  'membership-movement': z.boolean().default(true),
  'retention-and-churn': z.boolean().default(true),
  'members-at-risk': z.boolean().default(true),
  'expiring-memberships': z.boolean().default(true),
  'member-roster': z.boolean().default(true),
  'member-check-in-log': z.boolean().default(true),
  'upcoming-occasions': z.boolean().default(true),
  // Revenue
  'revenue-summary': z.boolean().default(true),
  'revenue-by-channel': z.boolean().default(true),
  'revenue-by-location': z.boolean().default(true),
  'outstanding-invoices': z.boolean().default(true),
  'projected-revenue': z.boolean().default(true),
  'refunds-accounting': z.boolean().default(true),
  // Classes
  'attendance-by-class': z.boolean().default(true),
  'class-utilization': z.boolean().default(true),
  'class-cancellations': z.boolean().default(true),
  'waitlist-demand': z.boolean().default(true),
  'pt-sessions': z.boolean().default(true),
  'no-show-rate': z.boolean().default(true),
  // Staff
  'trainer-performance': z.boolean().default(true),
});

/** The report visibility config — {@link gymReportsSettingsSchema}. */
export type GymReportsSettings = z.infer<typeof gymReportsSettingsSchema>;

/** One report toggle — a key of {@link GymReportsSettings}. */
export type ReportToggle = keyof GymReportsSettings;

/** Which payment methods the POS + checkout accept. */
export const gymPaymentMethodsSchema = z.object({
  acceptCash: z.boolean().default(true),
  acceptCard: z.boolean().default(true),
  acceptPrepaidCredits: z.boolean().default(true),
});

/** The gym's accepted payment methods — {@link gymPaymentMethodsSchema}. */
export type GymPaymentMethods = z.infer<typeof gymPaymentMethodsSchema>;

/**
 * Which toggle governs each settlement method.
 *
 * `acceptPrepaidCredits` maps to `member_account`: the balance a member pays from
 * *is* their account, so the setting and the till's third button are one policy
 * wearing two names. Written as a total record so adding a settlement method to
 * {@link paymentMethodSchema} fails to compile until it is given a toggle, rather
 * than silently defaulting to "always accepted".
 */
const PAYMENT_METHOD_TOGGLES = {
  cash: 'acceptCash',
  card: 'acceptCard',
  member_account: 'acceptPrepaidCredits',
} as const satisfies Record<PaymentMethod, keyof GymPaymentMethods>;

/**
 * The settlement methods this gym accepts, in the till's display order.
 *
 * The single statement of the "a switched-off method cannot be used" policy: the
 * POS renders exactly these buttons and the API refuses a sale settled with
 * anything outside them, both by calling this — so the screen and the server can
 * never disagree about what the gym accepts.
 */
export function enabledPaymentMethods(payments: GymPaymentMethods): PaymentMethod[] {
  return paymentMethodSchema.options.filter((method) => payments[PAYMENT_METHOD_TOGGLES[method]]);
}

/** Whether this gym accepts `method` — {@link enabledPaymentMethods} for one method. */
export function isPaymentMethodEnabled(
  payments: GymPaymentMethods,
  method: PaymentMethod,
): boolean {
  return payments[PAYMENT_METHOD_TOGGLES[method]];
}

/** How invoice numbers are composed. */
export const invoiceNumberFormatSchema = z.enum([
  'prefix-number',
  'prefix-year-number',
  'year-number',
]);

/** An invoice-number composition — a member of {@link invoiceNumberFormatSchema}. */
export type InvoiceNumberFormat = z.infer<typeof invoiceNumberFormatSchema>;

/**
 * Invoice numbering: the `prefix`, the first sequence `startNumber`, and the
 * composed `format`.
 */
export const gymInvoiceSettingsSchema = z.object({
  prefix: z.string().trim().max(10).default('INV'),
  startNumber: z.number().int().min(1).max(1_000_000_000).default(1000),
  format: invoiceNumberFormatSchema.default('prefix-year-number'),
});

/** The gym's invoice settings — {@link gymInvoiceSettingsSchema}. */
export type GymInvoiceSettings = z.infer<typeof gymInvoiceSettingsSchema>;

/** Digits the sequence number is zero-padded to (`0001`, `0042`, `1234`). */
export const INVOICE_SEQ_PAD_WIDTH = 4;

/** The composition an invoice reference is built from — prefix + shape. */
export type InvoiceNumbering = Pick<GymInvoiceSettings, 'prefix' | 'format'>;

/** The composition used when a caller states none — the shape that predates the setting. */
const DEFAULT_NUMBERING: InvoiceNumbering = { prefix: '', format: 'year-number' };

/**
 * Compose an invoice reference from its fiscal `year`, its sequence number `seq`, and
 * the gym's chosen shape: `"INV-2026-1000"`, `"INV-1000"`, or `"2026-0001"`.
 *
 * The single statement of the numbering rule: the settings screen previews the next
 * reference with it and the API stamps the minted invoice with it, so the sample a
 * gym is shown is the number it actually gets. (The atomic allocation of `seq` is a
 * database concern and stays in the API's `InvoiceService`; this half is pure.)
 *
 * `seq` is 1-based and zero-padded to {@link INVOICE_SEQ_PAD_WIDTH} digits; a `seq`
 * that outgrows the pad width (≥ 10 000) renders at its natural width rather than
 * truncating, so the reference stays unique and monotonic. A blank prefix contributes
 * no segment at all rather than a leading dash.
 *
 * `numbering` defaults to the bare `"<year>-<seq>"` produced before the setting was
 * honoured — the shape every invoice minted until then already carries.
 */
export function formatInvoiceNumber(
  year: number,
  seq: number,
  numbering: InvoiceNumbering = DEFAULT_NUMBERING,
): string {
  const padded = String(seq).padStart(INVOICE_SEQ_PAD_WIDTH, '0');
  const prefix = numbering.prefix.trim();
  const segments =
    numbering.format === 'year-number'
      ? [String(year), padded]
      : numbering.format === 'prefix-number'
        ? [prefix, padded]
        : [prefix, String(year), padded];
  return segments.filter((segment) => segment.length > 0).join('-');
}

/**
 * Whether a reference built with `numbering` carries its fiscal year.
 *
 * The sequence counter is partitioned by fiscal year so each January starts fresh —
 * but a shape with no year in it would then hand out `"INV-1000"` a second time and
 * collide with this year's. The mint site uses this to pick the counter bucket:
 * per-year for the year-bearing shapes, one continuous gym-wide bucket for the shape
 * without.
 */
export function invoiceNumberCarriesYear(numbering: InvoiceNumbering): boolean {
  return numbering.format !== 'prefix-number';
}

/** Receipt delivery channels. */
export const gymReceiptSettingsSchema = z.object({
  emailEnabled: z.boolean().default(true),
  printEnabled: z.boolean().default(false),
});

/** The gym's receipt settings — {@link gymReceiptSettingsSchema}. */
export type GymReceiptSettings = z.infer<typeof gymReceiptSettingsSchema>;

/**
 * The complete settings blob as stored in `Gym.settings`. Every section defaults,
 * so a bare `{}` (a gym that has never opened the settings page) parses to a full,
 * sensible default — the API always reads and returns a complete object so the
 * form never has to guess at missing fields.
 */
export const gymSettingsStoredSchema = z.object({
  brand: gymBrandSettingsSchema.default({}),
  business: gymBusinessSettingsSchema.default({}),
  locale: gymLocaleSchema.default({}),
  hours: weeklyHoursSchema.default({}),
  booking: gymBookingSettingsSchema.default({}),
  noShow: gymNoShowSettingsSchema.default({}),
  freeze: gymFreezeSettingsSchema.default({}),
  guestPass: gymGuestPassSettingsSchema.default({}),
  trial: gymTrialSettingsSchema.default({}),
  memberIntake: gymMemberIntakeSettingsSchema.default({}),
  staffDirectory: gymStaffDirectorySettingsSchema.default({}),
  reports: gymReportsSettingsSchema.default({}),
  payments: gymPaymentMethodsSchema.default({}),
  invoice: gymInvoiceSettingsSchema.default({}),
  receipt: gymReceiptSettingsSchema.default({}),
});

/** The stored settings blob — {@link gymSettingsStoredSchema}. */
export type GymSettingsStored = z.infer<typeof gymSettingsStoredSchema>;

/** The brand as the API returns it — the stored fields plus the gym's `name`. */
export interface GymBrand extends GymBrandSettings {
  /** The gym's display name (its canonical `Gym.name`). */
  name: string;
}

/**
 * The full gym settings as `GET /gyms/settings` returns them: the stored
 * brand/locale/hours/policies, with the gym's `name` folded into `brand`.
 */
export interface GymSettings {
  brand: GymBrand;
  business: GymBusinessSettings;
  locale: GymLocale;
  hours: WeeklyHours;
  booking: GymBookingSettings;
  noShow: GymNoShowSettings;
  freeze: GymFreezeSettings;
  guestPass: GymGuestPassSettings;
  trial: GymTrialSettings;
  memberIntake: GymMemberIntakeSettings;
  staffDirectory: GymStaffDirectorySettings;
  reports: GymReportsSettings;
  payments: GymPaymentMethods;
  invoice: GymInvoiceSettings;
  receipt: GymReceiptSettings;
}

/** Successful `GET /gyms/settings` response. */
export type GetGymSettingsResponse = GymSettings;

/**
 * Body for `PATCH /gyms/settings` — a partial update. Any section may be omitted;
 * within a provided section, any field may be omitted, and only the supplied
 * fields are changed (hours, when present, replaces the whole week, since the
 * form always sends the complete seven-day grid). `brand.name` writes through to
 * the gym's canonical `Gym.name`. Unknown keys are rejected so a client typo
 * surfaces as a `400` rather than being silently dropped.
 */
export const updateGymSettingsSchema = z
  .object({
    brand: z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        logoUrl: z.string().url().nullable().optional(),
        primaryColor: z.string().regex(HEX_COLOR_PATTERN, HEX_COLOR_MESSAGE).optional(),
        secondaryColor: z.string().regex(HEX_COLOR_PATTERN, HEX_COLOR_MESSAGE).optional(),
      })
      .strict()
      .optional(),
    business: gymBusinessSettingsSchema.partial().strict().optional(),
    locale: z
      .object({
        language: gymLanguageSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code, e.g. GEL')
          .optional(),
        timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional(),
      })
      .strict()
      .optional(),
    hours: weeklyHoursSchema.optional(),
    booking: gymBookingSettingsSchema.partial().strict().optional(),
    noShow: gymNoShowSettingsSchema.partial().strict().optional(),
    freeze: gymFreezeSettingsSchema.partial().strict().optional(),
    guestPass: gymGuestPassSettingsSchema.partial().strict().optional(),
    trial: gymTrialSettingsSchema.partial().strict().optional(),
    memberIntake: gymMemberIntakeSettingsSchema.partial().strict().optional(),
    staffDirectory: gymStaffDirectorySettingsSchema.partial().strict().optional(),
    reports: gymReportsSettingsSchema.partial().strict().optional(),
    payments: gymPaymentMethodsSchema.partial().strict().optional(),
    invoice: gymInvoiceSettingsSchema.partial().strict().optional(),
    receipt: gymReceiptSettingsSchema.partial().strict().optional(),
  })
  .strict();

/** Validated `PATCH /gyms/settings` body — {@link updateGymSettingsSchema}. */
export type UpdateGymSettingsInput = z.infer<typeof updateGymSettingsSchema>;

/** Successful `PATCH /gyms/settings` response — the full, updated settings. */
export type UpdateGymSettingsResponse = GymSettings;

/**
 * Body for `POST /gyms/settings/logo` — the R2 object `photoKey` of an
 * already-uploaded logo. The API turns it into a public URL, stores it as the
 * brand's `logoUrl`, and echoes the URL back.
 */
export const uploadGymLogoSchema = z.object({
  photoKey: z.string().trim().min(1),
});

/** Validated `POST /gyms/settings/logo` body — {@link uploadGymLogoSchema}. */
export type UploadGymLogoInput = z.infer<typeof uploadGymLogoSchema>;

/** Successful `POST /gyms/settings/logo` response. */
export interface UploadGymLogoResponse {
  logoUrl: string;
}

/**
 * The public-facing brand a visitor's tenant lookup (`GET /gyms/by-subdomain`)
 * surfaces — the name plus the renderable brand assets, never the private locale
 * or business settings.
 */
export interface GymPublicBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

/**
 * The gym's public contact details — the address, phone, email and website a
 * member is meant to reach it on. Exactly the {@link GymBusinessSettings} the
 * staff console fills in under Settings → Business info; every field is nullable
 * and an unset one is simply not rendered.
 *
 * Public on purpose, and only these four: they are the details a gym prints on
 * its own door. The rest of the settings blob (locale, sender addresses, every
 * policy) never leaves the authenticated surface.
 */
export type GymPublicContact = GymBusinessSettings;

/**
 * Project a gym's raw stored settings to its {@link GymPublicContact}. Tolerates a
 * `null` / legacy / hand-edited value by falling back to the schema defaults, so
 * the caller always gets four fields and never has to null-check the container.
 */
export function gymPublicContact(rawSettings: unknown): GymPublicContact {
  return gymSettingsStoredSchema.parse(rawSettings ?? {}).business;
}

/**
 * Project a gym's `name` + raw stored settings to its public {@link GymPublicBrand}.
 * Tolerates a `null`/legacy/hand-edited settings value by falling back to the
 * schema defaults, so the public lookup always has a complete, renderable brand.
 */
export function gymPublicBrand(name: string, rawSettings: unknown): GymPublicBrand {
  const stored = gymSettingsStoredSchema.parse(rawSettings ?? {});
  return {
    name,
    logoUrl: stored.brand.logoUrl,
    primaryColor: stored.brand.primaryColor,
    secondaryColor: stored.brand.secondaryColor,
  };
}
