import { validateEnv, z } from '@fit/env';

/**
 * The operator console's environment, validated once at boot (imported by
 * `instrumentation.ts`). `NEXT_PUBLIC_API_URL` is inlined into the bundle;
 * `JWT_SECRET` backs the SUPER_ADMIN cookie gate. Optional with format checks —
 * boot fails fast only on a malformed value.
 */
export const env = validateEnv(
  z.object({
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_COOKIE_DOMAIN: z.string().optional(),
    JWT_SECRET: z.string().min(1).optional(),
  }),
);
