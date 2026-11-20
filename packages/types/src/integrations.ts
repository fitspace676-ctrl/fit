import { z } from 'zod';

export const integrationProviderSchema = z.enum(['flitt']);
export const gymIntegrationSchema = z.object({
  provider: integrationProviderSchema,
  connected: z.boolean(),
  enabled: z.boolean(),
  merchantId: z.string().nullable(),
  secretHint: z.string().nullable(),
  verifiedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  testMode: z.boolean(),
});
export const connectFlittSchema = z.object({
  merchantId: z.string().regex(/^\d{1,12}$/),
  secretKey: z.string().trim().min(1).max(200),
});
export const setIntegrationEnabledSchema = z.object({ enabled: z.boolean() });
export const testIntegrationResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['bad_key', 'unknown_merchant', 'unreachable']).optional(),
});
export type GymIntegration = z.infer<typeof gymIntegrationSchema>;
export type ConnectFlittInput = z.infer<typeof connectFlittSchema>;
export type SetIntegrationEnabledInput = z.infer<typeof setIntegrationEnabledSchema>;
export type TestIntegrationResponse = z.infer<typeof testIntegrationResponseSchema>;
