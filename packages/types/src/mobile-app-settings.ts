import { z } from 'zod';

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
export const updateMobileAppSettingsSchema = z
  .object({ features: mobileAppFeaturesSchema })
  .strict();
export type UpdateMobileAppSettingsInput = z.infer<typeof updateMobileAppSettingsSchema>;
/** Where the sign-in photograph the app shows comes from; `null` means no photo. */
export type MobileAppLoginImageSource = 'app' | 'portal';
export interface MobileAppSettings {
  enabled: boolean;
  features: MobileAppFeatures;
  /** The sign-in hero, already resolved: the app's own photo, else the portal's. */
  loginImageUrl: string | null;
  loginImageSource: MobileAppLoginImageSource | null;
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
