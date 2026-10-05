import { z } from 'zod';
import { DEFAULT_PRIMARY_COLOR, HEX_COLOR_PATTERN } from './gym-settings';
import { readableTextOn } from './mobile-app-theme';

/** Home and profile remain available so every configuration has a usable shell. */
export const mobileAppFeaturesSchema = z
  .object({
    classes: z.boolean(),
    shop: z.boolean(),
    qr: z.boolean(),
    services: z.boolean(),
    trainers: z.boolean(),
    membership: z.boolean(),
    billing: z.boolean(),
    bookings: z.boolean(),
    activity: z.boolean(),
    goals: z.boolean(),
    notifications: z.boolean(),
  })
  .strict();
export type MobileAppFeatures = z.infer<typeof mobileAppFeaturesSchema>;
export type MobileAppFeature = keyof MobileAppFeatures;
export const DEFAULT_MOBILE_APP_FEATURES: MobileAppFeatures = {
  classes: true,
  shop: true,
  qr: true,
  services: true,
  trainers: true,
  membership: true,
  billing: true,
  bookings: true,
  activity: true,
  goals: true,
  notifications: true,
};
export const MOBILE_APP_FEATURES = Object.keys(DEFAULT_MOBILE_APP_FEATURES) as MobileAppFeature[];
/** `null` clears the app's own colour, so it follows the portal's again. */
export const mobileAppPrimaryColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, 'Color must be a hex value like #1a7fd6')
  .nullable();
/** Either half may be saved on its own: the console saves each card separately. */
export const updateMobileAppSettingsSchema = z
  .object({
    features: mobileAppFeaturesSchema.optional(),
    primaryColor: mobileAppPrimaryColorSchema.optional(),
  })
  .strict()
  .refine((input) => input.features !== undefined || input.primaryColor !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateMobileAppSettingsInput = z.infer<typeof updateMobileAppSettingsSchema>;
/** Where the sign-in photograph the app shows comes from; `null` means no photo. */
export type MobileAppLoginImageSource = 'app' | 'portal';
/** Where the app's accent comes from; `null` means the built-in theme. */
export type MobileAppPrimaryColorSource = 'app' | 'portal' | 'brand';
export interface MobileAppSettings {
  enabled: boolean;
  features: MobileAppFeatures;
  /** The sign-in hero, already resolved: the app's own photo, else the portal's. */
  loginImageUrl: string | null;
  loginImageSource: MobileAppLoginImageSource | null;
  /**
   * The app's accent, already resolved: its own colour, else the member portal's,
   * else the brand's. `null` keeps the app's built-in theme.
   */
  primaryColor: string | null;
  primaryColorSource: MobileAppPrimaryColorSource | null;
  /** What `primaryColor` would be without the app's own colour — the console's reset target. */
  inheritedPrimaryColor: string | null;
  inheritedPrimaryColorSource: Exclude<MobileAppPrimaryColorSource, 'app'> | null;
  /** The readable label colour on a `primaryColor` fill (≥ 4.5:1), or `null` with it. */
  onPrimaryColor: string | null;
}
/** Body for `POST /gyms/app-settings/login-image`: an uploaded R2 object key. */
export const uploadMobileAppLoginImageSchema = z
  .object({ photoKey: z.string().trim().min(1) })
  .strict();
export type UploadMobileAppLoginImageInput = z.infer<typeof uploadMobileAppLoginImageSchema>;
/**
 * The app's own photo wins; without one the app borrows the member portal's
 * sign-in photo. A gym without an app shows none, and a malformed stored value
 * never reaches a client.
 */
export function resolveMobileAppLoginImage(
  enabled: boolean,
  own: string | null | undefined,
  portal: unknown,
): Pick<MobileAppSettings, 'loginImageUrl' | 'loginImageSource'> {
  if (enabled && typeof own === 'string' && own.trim() !== '') {
    return { loginImageUrl: own, loginImageSource: 'app' };
  }
  if (enabled && typeof portal === 'string' && portal.trim() !== '') {
    return { loginImageUrl: portal, loginImageSource: 'portal' };
  }
  return { loginImageUrl: null, loginImageSource: null };
}
/** Legacy rows start with all features visible; malformed values never escape the API. */
export function resolveMobileAppFeatures(raw: unknown): MobileAppFeatures {
  const stored = mobileAppFeaturesSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_MOBILE_APP_FEATURES, ...(stored.success ? stored.data : {}) };
}

function storedHex(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value : null;
}

/**
 * The app's own colour wins, then the member portal's, then the brand's. The
 * brand colour counts only once a gym has set it: the stored schema defaults it
 * to the platform indigo, and a default written for invoices must not repaint
 * every app on deploy. A gym without an app gets none, and a malformed stored
 * value never reaches a client.
 */
export function resolveMobileAppPrimaryColor(
  enabled: boolean,
  own: string | null | undefined,
  rawSettings: unknown,
): Pick<
  MobileAppSettings,
  | 'primaryColor'
  | 'primaryColorSource'
  | 'inheritedPrimaryColor'
  | 'inheritedPrimaryColorSource'
  | 'onPrimaryColor'
> {
  const none = {
    primaryColor: null,
    primaryColorSource: null,
    inheritedPrimaryColor: null,
    inheritedPrimaryColorSource: null,
    onPrimaryColor: null,
  };
  if (!enabled) return none;
  const settings = rawSettings as {
    memberPortal?: { primaryColor?: unknown };
    brand?: { primaryColor?: unknown };
  } | null;
  const portal = storedHex(settings?.memberPortal?.primaryColor);
  const brandHex = storedHex(settings?.brand?.primaryColor);
  const brand =
    brandHex !== null && brandHex.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase()
      ? brandHex
      : null;
  const app = storedHex(own);
  const inheritedPrimaryColor = portal ?? brand;
  const inheritedPrimaryColorSource = portal ? 'portal' : brand ? 'brand' : null;
  const primaryColor = app ?? inheritedPrimaryColor;
  if (primaryColor === null) return none;
  return {
    primaryColor,
    primaryColorSource: app ? 'app' : (inheritedPrimaryColorSource ?? 'brand'),
    inheritedPrimaryColor,
    inheritedPrimaryColorSource,
    onPrimaryColor: readableTextOn(primaryColor),
  };
}
