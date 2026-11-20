/* eslint-disable @typescript-eslint/require-await -- jest mocks */
import { describe, expect, it, vi } from 'vitest';
import type { GetOrderResponse, OrderPaymentStatus, PaymentAction } from '@fit/types';
import { canPayOnline, launchPayment, paymentScheme, pollPayment } from './payment-flow';

const action: PaymentAction = {
  status: 'requires_action',
  orderId: 'ord/1',
  checkoutUrl: 'https://checkout.flitt.com/pay',
  expiresAt: null,
};
function order(status: OrderPaymentStatus): GetOrderResponse {
  return {
    order: {
      id: 'ord/1',
      status: status === 'paid' ? 'paid' : 'pending',
      total: 200,
      currency: 'GEL',
      items: [],
      payment: {
        status,
        provider: 'flitt',
        retry: status !== 'paid',
        checkoutUrl: null,
        expiresAt: null,
      },
    },
  };
}

describe('hosted payment', () => {
  it.each(['success', 'cancel', 'dismiss'])(
    'sync route follows browser %s with the configured return scheme',
    async (type) => {
      const open = vi.fn().mockResolvedValue({ type });
      const result = vi.fn();
      expect(await launchPayment(action, { scheme: 'synergy', open, result })).toBe(true);
      expect(open).toHaveBeenCalledWith(action.checkoutUrl, 'synergy://checkout/result');
      expect(result).toHaveBeenCalledWith(
        `/checkout/result?orderId=ord%2F1${type === 'success' ? '' : '&dismissed=1'}`,
      );
    },
  );
  it('never routes an instant payment through a browser', async () => {
    const deps = { scheme: 'fit', open: vi.fn(), result: vi.fn() };
    expect(await launchPayment(undefined, deps)).toBe(false);
    expect(await launchPayment({ ...action, status: 'paid', checkoutUrl: null }, deps)).toBe(false);
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.result).not.toHaveBeenCalled();
  });
  it('still recovers the existing order when launching the browser fails', async () => {
    const result = vi.fn();
    await expect(
      launchPayment(action, {
        scheme: 'fit',
        result,
        open: vi.fn().mockRejectedValue(new Error('browser')),
      }),
    ).rejects.toThrow('browser');
    expect(result).toHaveBeenCalledWith('/checkout/result?orderId=ord%2F1');
  });
  it('uses the resolved scheme, including array configuration', () => {
    expect(paymentScheme('fit')).toBe('fit');
    expect(paymentScheme(['synergy', 'other'])).toBe('synergy');
    expect(() => paymentScheme(undefined)).toThrow();
  });
  it('requires explicit online capability; disabled and unknown cannot sell', () => {
    expect(canPayOnline(undefined)).toBe(false);
    expect(canPayOnline({ enabled: false, provider: null })).toBe(false);
    expect(canPayOnline({ enabled: true, provider: 'flitt' })).toBe(true);
    expect(canPayOnline({ enabled: true, provider: 'stub' })).toBe(true);
  });
});

describe('payment result polling', () => {
  it('syncs immediately, then stops as soon as paid', async () => {
    const sync = vi
      .fn()
      .mockResolvedValueOnce(order('pending'))
      .mockResolvedValueOnce(order('requires_action'))
      .mockResolvedValue(order('paid'));
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(
      (await pollPayment(sync, { signal: new AbortController().signal, wait }))?.order.payment
        ?.status,
    ).toBe('paid');
    expect(sync).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
  it('stops after 8 seconds when nobody has paid, preserving retry state', async () => {
    let time = 0;
    const sync = vi.fn().mockResolvedValue(order('requires_action'));
    const result = await pollPayment(sync, {
      signal: new AbortController().signal,
      now: () => time,
      wait: async () => {
        time += 2000;
      },
    });
    expect(time).toBe(8000);
    expect(sync).toHaveBeenCalledTimes(5);
    expect(result?.order.payment?.retry).toBe(true);
  });
  it('keeps asking for 90 seconds while the bank is processing', async () => {
    let time = 0;
    const processing = order('requires_action');
    processing.order.payment = { ...processing.order.payment!, processing: true };
    const sync = vi.fn().mockResolvedValue(processing);
    await pollPayment(sync, {
      signal: new AbortController().signal,
      now: () => time,
      wait: async () => {
        time += 2000;
      },
    });
    expect(time).toBe(90000);
    expect(sync).toHaveBeenCalledTimes(46);
  });
  it('asks once when the buyer closed the payment page, unless the bank is processing', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const signal = new AbortController().signal;
    const idle = vi.fn().mockResolvedValue(order('requires_action'));
    await pollPayment(idle, { signal, wait, dismissed: true });
    expect(idle).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();

    const processing = order('requires_action');
    processing.order.payment = { ...processing.order.payment!, processing: true };
    const busy = vi.fn().mockResolvedValueOnce(processing).mockResolvedValue(order('paid'));
    expect(
      (await pollPayment(busy, { signal, wait, dismissed: true }))?.order.payment?.status,
    ).toBe('paid');
    expect(busy).toHaveBeenCalledTimes(2);
  });
  it.each(['failed', 'expired', 'refunded'] as const)(
    'does not poll a terminal %s state',
    async (status) => {
      const wait = vi.fn();
      await pollPayment(vi.fn().mockResolvedValue(order(status)), {
        signal: new AbortController().signal,
        wait,
      });
      expect(wait).not.toHaveBeenCalled();
    },
  );
  it('stops after unmount', async () => {
    const controller = new AbortController();
    const sync = vi.fn().mockResolvedValue(order('pending'));
    await pollPayment(sync, {
      signal: controller.signal,
      wait: async () => {
        controller.abort();
      },
    });
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
