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
export interface MobileAppSettings {
  enabled: boolean;
  features: MobileAppFeatures;
}
/** Legacy rows start with all features visible; malformed values never escape the API. */
export function resolveMobileAppFeatures(raw: unknown): MobileAppFeatures {
  const stored = mobileAppFeaturesSchema.partial().safeParse(raw ?? {});
  return { ...DEFAULT_MOBILE_APP_FEATURES, ...(stored.success ? stored.data : {}) };
}
