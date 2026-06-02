import { validateEnv, z } from '@fit/env';

/**
 * The platform (marketing / owner-signup) app's environment, validated once at
 * boot (imported by `instrumentation.ts`). Only the API base URL today (the
 * signup form posts to `register-gym`); optional with a URL format check.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
  }),
);
