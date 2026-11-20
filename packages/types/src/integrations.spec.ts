import { describe, expect, it } from 'vitest';
import {
  connectFlittSchema,
  gymIntegrationSchema,
  integrationProviderSchema,
  setIntegrationEnabledSchema,
  testIntegrationResponseSchema,
} from './integrations';

describe('integration contracts', () => {
  it('accepts only digit merchant IDs and trims the payment key', () => {
    expect(connectFlittSchema.parse({ merchantId: '1549901', secretKey: ' test ' })).toEqual({
      merchantId: '1549901',
      secretKey: 'test',
    });
    for (const merchantId of ['', 'a123', '1234567890123', 1549901]) {
      expect(connectFlittSchema.safeParse({ merchantId, secretKey: 'test' }).success).toBe(false);
    }
    for (const secretKey of ['', '   ', 'a'.repeat(201)]) {
      expect(connectFlittSchema.safeParse({ merchantId: '1', secretKey }).success).toBe(false);
    }
  });
  it('models the disconnected entry without exposing secret fields', () => {
    const row = gymIntegrationSchema.parse({
      provider: 'flitt',
      connected: false,
      enabled: false,
      merchantId: null,
      secretHint: null,
      verifiedAt: null,
      lastError: null,
      testMode: false,
      secretKey: 'must be stripped',
    });
    expect(row).not.toHaveProperty('secretKey');
    expect(integrationProviderSchema.safeParse('stripe').success).toBe(false);
  });
  it('validates enable/test payloads', () => {
    expect(setIntegrationEnabledSchema.safeParse({ enabled: 'true' }).success).toBe(false);
    expect(testIntegrationResponseSchema.parse({ ok: false, reason: 'bad_key' })).toEqual({
      ok: false,
      reason: 'bad_key',
    });
    expect(
      testIntegrationResponseSchema.safeParse({ ok: false, reason: 'raw provider message' })
        .success,
    ).toBe(false);
  });
});
