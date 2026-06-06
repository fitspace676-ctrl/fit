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

/**
 * The complete settings blob as stored in `Gym.settings`. Every section defaults,
 * so a bare `{}` (a gym that has never opened the settings page) parses to a full,
 * sensible default — the API always reads and returns a complete object so the
 * form never has to guess at missing fields.
 */
export const gymSettingsStoredSchema = z.object({
  brand: gymBrandSettingsSchema.default({}),
  locale: gymLocaleSchema.default({}),
  hours: weeklyHoursSchema.default({}),
  notifications: gymNotificationsSchema.default({}),
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
  locale: GymLocale;
  hours: WeeklyHours;
  notifications: GymNotifications;
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
