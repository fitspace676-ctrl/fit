import { describe, expect, it } from 'vitest';
import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from '@fit/db';
import { toOrderPaymentState } from './order-payment-state';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const LATER = new Date('2026-11-20T12:20:00.000Z');
const EARLIER = new Date('2026-11-20T11:00:00.000Z');
const flitt = { provider: 'flitt', status: PaymentStatus.PENDING };

describe('toOrderPaymentState', () => {
  it('reads a paid order as paid, whatever its provider', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PAID,
        payment: { provider: 'stub', status: PaymentStatus.CAPTURED },
        latestAttempt: null,
        now: NOW,
      }),
    ).toEqual({
      status: 'paid',
      provider: 'stub',
      retry: false,
      checkoutUrl: null,
      expiresAt: null,
    });
  });

  it('reads a refunded order as refunded', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.REFUNDED,
        payment: { provider: 'flitt', status: PaymentStatus.REFUNDED },
        latestAttempt: null,
        now: NOW,
      }).status,
    ).toBe('refunded');
  });

  it('keeps a pay-at-pickup shop order pending with nothing to retry', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: null,
        latestAttempt: null,
        now: NOW,
      }),
    ).toEqual({
      status: 'pending',
      provider: null,
      retry: false,
      checkoutUrl: null,
      expiresAt: null,
    });
  });

  it('hands back a live checkout as requires_action', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: {
          status: PaymentAttemptStatus.PENDING,
          checkoutUrl: 'https://pay.flitt.com/merchants/x',
          expiresAt: LATER,
        },
        now: NOW,
      }),
    ).toEqual({
      status: 'requires_action',
      provider: 'flitt',
      processing: false,
      retry: true,
      checkoutUrl: 'https://pay.flitt.com/merchants/x',
      expiresAt: LATER.toISOString(),
    });
  });

  it('says the payment is processing only when the provider does', () => {
    const state = (providerStatus: string | null) =>
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: {
          status: PaymentAttemptStatus.PENDING,
          checkoutUrl: 'https://pay.flitt.com/merchants/x',
          expiresAt: LATER,
          providerStatus,
        },
        now: NOW,
      });
    expect(state('processing')).toMatchObject({ status: 'requires_action', processing: true });
    expect(state('created')).toMatchObject({ status: 'requires_action', processing: false });
    expect(state(null)).toMatchObject({ status: 'requires_action', processing: false });
  });

  it('waits (pending, no retry) on an open attempt past its lifetime', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: {
          status: PaymentAttemptStatus.PENDING,
          checkoutUrl: 'https://pay.flitt.com/merchants/x',
          expiresAt: EARLIER,
        },
        now: NOW,
      }),
    ).toMatchObject({ status: 'pending', retry: false, checkoutUrl: null });
  });

  it('offers a retry after a decline or an expiry, but not on a cancelled order', () => {
    const declined = { status: PaymentAttemptStatus.FAILED, checkoutUrl: null, expiresAt: EARLIER };
    const expired = { status: PaymentAttemptStatus.EXPIRED, checkoutUrl: null, expiresAt: EARLIER };
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: declined,
        now: NOW,
      }),
    ).toMatchObject({ status: 'failed', retry: true });
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: expired,
        now: NOW,
      }),
    ).toMatchObject({ status: 'expired', retry: true });
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.CANCELLED,
        payment: flitt,
        latestAttempt: expired,
        now: NOW,
      }),
    ).toMatchObject({ status: 'expired', retry: false });
  });

  it('never offers a retry on an attempt that needs review (money may have moved)', () => {
    expect(
      toOrderPaymentState({
        orderStatus: OrderStatus.PENDING,
        payment: flitt,
        latestAttempt: {
          status: PaymentAttemptStatus.NEEDS_REVIEW,
          checkoutUrl: null,
          expiresAt: EARLIER,
        },
        now: NOW,
      }),
    ).toMatchObject({ status: 'pending', retry: false });
  });
});
