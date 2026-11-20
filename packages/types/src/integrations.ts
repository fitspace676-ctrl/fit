import { z } from 'zod';

// `flitt` takes online payments; `sender` (Sender.ge) delivers SMS; `zkteco`
// drives turnstiles and doors (its own contract is in `./zkteco`). Each gym
// connects its own account for any of them, on the owner's Integrations page.
export const integrationProviderSchema = z.enum(['flitt', 'sender', 'zkteco']);
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
  /** Sender.ge only: the account balance in GEL as the provider reports it ("123.45"). */
  balance: z.string().optional(),
});

/** Body for `PUT /integrations/sender`. The key is verified against the provider before it is stored. */
export const connectSenderSchema = z.object({
  apiKey: z.string().trim().min(1).max(200),
});

/**
 * Body for `POST /integrations/sender/test-message`: one real SMS to the
 * owner's own phone, so they can see the sender name members will see.
 */
export const sendTestSmsSchema = z.object({
  phone: z.string().trim().min(9).max(20),
});
export const sendTestSmsResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['invalid_phone', 'rejected', 'unreachable']).optional(),
});
export type GymIntegration = z.infer<typeof gymIntegrationSchema>;
export type ConnectFlittInput = z.infer<typeof connectFlittSchema>;
export type SetIntegrationEnabledInput = z.infer<typeof setIntegrationEnabledSchema>;
export type TestIntegrationResponse = z.infer<typeof testIntegrationResponseSchema>;
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;
export type ConnectSenderInput = z.infer<typeof connectSenderSchema>;
export type SendTestSmsInput = z.infer<typeof sendTestSmsSchema>;
export type SendTestSmsResponse = z.infer<typeof sendTestSmsResponseSchema>;
