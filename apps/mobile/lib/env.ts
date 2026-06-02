import { validateEnv, z } from '@fit/env';

/**
 * The mobile app's environment, validated once at boot (imported by
 * `app/_layout.tsx`). `EXPO_PUBLIC_*` vars are inlined into the app bundle.
 * Optional with format checks — launch fails fast only on a malformed value
 * (e.g. a bad API URL), never on a missing optional integration.
 */
export const env = validateEnv(
  z.object({
    EXPO_PUBLIC_API_URL: z.string().url().optional(),
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: z.string().optional(),
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: z.string().optional(),
    EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
    EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    EXPO_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
  }),
);
