// @fit/types — gym settings contracts (brand, locale, business hours, notifications).
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

/**
 * Notification settings for the gym's outbound email: the `fromEmail` /
 * `fromName` member mail is sent as, and an optional `replyTo`. All nullable —
 * an unset value falls back to the platform default sender at send time.
 */
export const gymNotificationsSchema = z.object({
  fromEmail: z.string().email().nullable().default(null),
  fromName: z.string().trim().max(100).nullable().default(null),
  replyTo: z.string().email().nullable().default(null),
});

/** The gym's notification settings — {@link gymNotificationsSchema}. */
export type GymNotifications = z.infer<typeof gymNotificationsSchema>;

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
 * Membership grace period: days past a failed renewal a membership keeps working
 * before it lapses. `0` = no grace.
 */
export const gymMembershipSettingsSchema = z.object({
  gracePeriodDays: z.number().int().min(0).max(90).default(0),
});

/** The gym's membership grace-period policy — {@link gymMembershipSettingsSchema}. */
export type GymMembershipSettings = z.infer<typeof gymMembershipSettingsSchema>;

/** Which payment methods the POS + checkout accept. */
export const gymPaymentMethodsSchema = z.object({
  acceptCash: z.boolean().default(true),
  acceptCard: z.boolean().default(true),
  acceptPrepaidCredits: z.boolean().default(true),
});

/** The gym's accepted payment methods — {@link gymPaymentMethodsSchema}. */
export type GymPaymentMethods = z.infer<typeof gymPaymentMethodsSchema>;

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

/**
 * Tax settings: a master `enabled` switch and per-category rates (percent, `0`–`100`).
 * All rates default to `0`; `enabled` = `false` means no tax is applied regardless.
 */
export const gymTaxSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  membershipRate: z.number().min(0).max(100).default(0),
  classRate: z.number().min(0).max(100).default(0),
  productRate: z.number().min(0).max(100).default(0),
  serviceRate: z.number().min(0).max(100).default(0),
});

/** The gym's tax settings — {@link gymTaxSettingsSchema}. */
export type GymTaxSettings = z.infer<typeof gymTaxSettingsSchema>;

/** How a refund is calculated when a membership is cancelled mid-term. */
export const refundPolicyModeSchema = z.enum(['full', 'prorated', 'none']);

/** A refund calculation mode — a member of {@link refundPolicyModeSchema}. */
export type RefundPolicyMode = z.infer<typeof refundPolicyModeSchema>;

/**
 * Refund policy: the calculation `mode` and the `windowDays` within which a refund
 * may be requested (`0` = no window limit).
 */
export const gymRefundSettingsSchema = z.object({
  mode: refundPolicyModeSchema.default('prorated'),
  windowDays: z.number().int().min(0).max(365).default(0),
});

/** The gym's refund policy — {@link gymRefundSettingsSchema}. */
export type GymRefundSettings = z.infer<typeof gymRefundSettingsSchema>;

/** Receipt delivery channels. */
export const gymReceiptSettingsSchema = z.object({
  emailEnabled: z.boolean().default(true),
  printEnabled: z.boolean().default(false),
});

/** The gym's receipt settings — {@link gymReceiptSettingsSchema}. */
export type GymReceiptSettings = z.infer<typeof gymReceiptSettingsSchema>;

/**
 * Auto-renewal policy for recurring memberships (T5.4): the master `enabled`
 * switch, the failed-charge `retryAttempts` and `retryIntervalDays` between them,
 * and how many `renewalReminderDays` before renewal a reminder is sent.
 */
export const gymAutoRenewalSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  retryAttempts: z.number().int().min(0).max(10).default(3),
  retryIntervalDays: z.number().int().min(0).max(30).default(3),
  renewalReminderDays: z.number().int().min(0).max(90).default(7),
});

/** The gym's auto-renewal policy — {@link gymAutoRenewalSettingsSchema}. */
export type GymAutoRenewalSettings = z.infer<typeof gymAutoRenewalSettingsSchema>;

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
  notifications: gymNotificationsSchema.default({}),
  booking: gymBookingSettingsSchema.default({}),
  noShow: gymNoShowSettingsSchema.default({}),
  freeze: gymFreezeSettingsSchema.default({}),
  guestPass: gymGuestPassSettingsSchema.default({}),
  trial: gymTrialSettingsSchema.default({}),
  membership: gymMembershipSettingsSchema.default({}),
  payments: gymPaymentMethodsSchema.default({}),
  invoice: gymInvoiceSettingsSchema.default({}),
  tax: gymTaxSettingsSchema.default({}),
  refund: gymRefundSettingsSchema.default({}),
  receipt: gymReceiptSettingsSchema.default({}),
  autoRenewal: gymAutoRenewalSettingsSchema.default({}),
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
 * brand/locale/hours/notifications, with the gym's `name` folded into `brand`.
 */
export interface GymSettings {
  brand: GymBrand;
  business: GymBusinessSettings;
  locale: GymLocale;
  hours: WeeklyHours;
  notifications: GymNotifications;
  booking: GymBookingSettings;
  noShow: GymNoShowSettings;
  freeze: GymFreezeSettings;
  guestPass: GymGuestPassSettings;
  trial: GymTrialSettings;
  membership: GymMembershipSettings;
  payments: GymPaymentMethods;
  invoice: GymInvoiceSettings;
  tax: GymTaxSettings;
  refund: GymRefundSettings;
  receipt: GymReceiptSettings;
  autoRenewal: GymAutoRenewalSettings;
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
    notifications: z
      .object({
        fromEmail: z.string().email().nullable().optional(),
        fromName: z.string().trim().max(100).nullable().optional(),
        replyTo: z.string().email().nullable().optional(),
      })
      .strict()
      .optional(),
    booking: gymBookingSettingsSchema.partial().strict().optional(),
    noShow: gymNoShowSettingsSchema.partial().strict().optional(),
    freeze: gymFreezeSettingsSchema.partial().strict().optional(),
    guestPass: gymGuestPassSettingsSchema.partial().strict().optional(),
    trial: gymTrialSettingsSchema.partial().strict().optional(),
    membership: gymMembershipSettingsSchema.partial().strict().optional(),
    payments: gymPaymentMethodsSchema.partial().strict().optional(),
    invoice: gymInvoiceSettingsSchema.partial().strict().optional(),
    tax: gymTaxSettingsSchema.partial().strict().optional(),
    refund: gymRefundSettingsSchema.partial().strict().optional(),
    receipt: gymReceiptSettingsSchema.partial().strict().optional(),
    autoRenewal: gymAutoRenewalSettingsSchema.partial().strict().optional(),
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
 * or notification settings.
 */
export interface GymPublicBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
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
