import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `env` is a frozen singleton; mock it with a mutable stand-in so each test can
// flip NODE_ENV without re-importing the module under a different real env.
const { mockEnv } = vi.hoisted(() => ({ mockEnv: { NODE_ENV: 'test' } }));
vi.mock('../config/env', () => ({ env: mockEnv }));

import { StubPaymentProvider } from './stub-payment-provider';
import type { RenewalChargeInput } from './payment-provider';

const CHARGE: RenewalChargeInput = {
  subscriptionId: 'sub-1',
  gymId: 'gym-1',
  memberId: 'member-1',
  amount: 5000,
  currency: 'GEL',
  idempotencyKey: 'sub-1:2026-08-01T00:00:00.000Z:r0',
  providerRef: null,
};

describe('StubPaymentProvider', () => {
  let provider: StubPaymentProvider;

  beforeEach(() => {
    provider = new StubPaymentProvider();
    mockEnv.NODE_ENV = 'test';
  });

  afterEach(() => vi.clearAllMocks());

  it('is keyed "stub", matching the tag enrolment/shop flows stamp', () => {
    expect(provider.key).toBe('stub');
  });

  it('settles every charge outside production (no gateway can decline)', async () => {
    mockEnv.NODE_ENV = 'development';
    await expect(provider.chargeRenewal(CHARGE)).resolves.toEqual({
      outcome: 'succeeded',
      providerRef: null,
    });
  });

  it('settles in the test environment too', async () => {
    mockEnv.NODE_ENV = 'test';
    const result = await provider.chargeRenewal(CHARGE);
    expect(result.outcome).toBe('succeeded');
  });

  it('throws in production rather than faking a charge for real money', async () => {
    mockEnv.NODE_ENV = 'production';
    // A throw (not a `failed` result) so the billing job treats it as an infra
    // fault and leaves the subscription untouched — the member is not penalised.
    await expect(provider.chargeRenewal(CHARGE)).rejects.toThrow(/production/i);
  });

  it('does not implement a webhook handler (the stub has no gateway)', () => {
    // The optional handler is absent — the webhook controller relies on this to
    // answer 501 for the stub's route (asserted end-to-end in the controller spec).
    expect(Object.hasOwn(provider, 'handleWebhook')).toBe(false);
  });
});
