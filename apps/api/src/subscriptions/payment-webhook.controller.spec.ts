import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { PaymentWebhookController } from './payment-webhook.controller';
import type {
  PaymentProvider,
  PaymentWebhookInput,
  PaymentWebhookResult,
} from './payment-provider';

function make(provider: PaymentProvider) {
  return new PaymentWebhookController(provider);
}

const HEADERS = { 'x-signature': 'sig' };
const PAYLOAD = { type: 'charge.succeeded', id: 'evt_1' };

describe('PaymentWebhookController', () => {
  afterEach(() => vi.clearAllMocks());

  describe('provider without a webhook handler (the stub)', () => {
    const stub: PaymentProvider = {
      key: 'stub',
      chargeRenewal: vi.fn(),
    };

    it('answers 501 for its own route — the entry point exists but has no gateway', async () => {
      const error = await make(stub)
        .receive('stub', HEADERS, PAYLOAD)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotImplementedException);
    });

    it('still 404s a mismatched :provider before reaching the 501 branch', async () => {
      const error = await make(stub)
        .receive('stripe', HEADERS, PAYLOAD)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
    });
  });

  describe('provider with a webhook handler', () => {
    let handleWebhook: ReturnType<typeof vi.fn>;
    let provider: PaymentProvider;

    beforeEach(() => {
      handleWebhook = vi.fn(
        (_input: PaymentWebhookInput): Promise<PaymentWebhookResult> =>
          Promise.resolve({ handled: true, note: 'charge settled' }),
      );
      provider = { key: 'stripe', chargeRenewal: vi.fn(), handleWebhook };
    });

    it('dispatches the matched event to the provider and returns its result', async () => {
      const result = await make(provider).receive('stripe', HEADERS, PAYLOAD);

      expect(handleWebhook).toHaveBeenCalledWith({
        providerKey: 'stripe',
        headers: HEADERS,
        payload: PAYLOAD,
      });
      expect(result).toEqual({ received: true, handled: true, note: 'charge settled' });
    });

    it('reports handled:false (still 200) for an unrecognised/duplicate event', async () => {
      handleWebhook.mockResolvedValueOnce({ handled: false });
      const result = await make(provider).receive('stripe', HEADERS, PAYLOAD);
      expect(result).toEqual({ received: true, handled: false, note: undefined });
    });

    it('404s a :provider that does not match the bound provider', async () => {
      const error = await make(provider)
        .receive('tbc', HEADERS, PAYLOAD)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundException);
      expect(handleWebhook).not.toHaveBeenCalled();
    });

    it('propagates a rejected-event error (bad signature → 400) from the provider', async () => {
      handleWebhook.mockRejectedValueOnce(new BadRequestException('bad signature'));
      const error = await make(provider)
        .receive('stripe', HEADERS, PAYLOAD)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
    });

    it('400s if the provider resolves nothing (contract violation)', async () => {
      handleWebhook.mockResolvedValueOnce(undefined);
      const error = await make(provider)
        .receive('stripe', HEADERS, PAYLOAD)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
    });
  });
});
