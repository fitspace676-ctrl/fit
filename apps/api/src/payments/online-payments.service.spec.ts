import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PaymentAttemptStatus } from '@fit/db';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import type { FlittClient } from '../integrations/flitt/flitt-client';
import { signFlittParams } from '../integrations/flitt/flitt-signature';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { PromoRedemptionService } from '../marketing/promo-redemption.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  OnlinePaymentsService,
  buildResultUrl,
  paymentMismatch,
  resolvePurchaseMode,
} from './online-payments.service';

const stub = vi.hoisted(() => ({ enabled: true }));
vi.mock('../config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/env')>();
  return { ...actual, onlinePaymentsStubEnabled: () => stub.enabled };
});

const SECRET = 'gym-secret';
const CREDS = { merchantId: '1549901', secretKey: SECRET };

function attemptRow(over: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    gymId: 'gym-1',
    orderId: 'order-1',
    paymentId: 'pay-1',
    provider: 'flitt',
    merchantId: '1549901',
    providerOrderId: 'att-1',
    providerPaymentId: null,
    amount: 2500,
    currency: 'GEL',
    status: PaymentAttemptStatus.PENDING,
    purpose: 'credit_pack',
    fulfilment: { kind: 'credit_pack', planId: 'plan-1', name: '10 classes', credits: 10, validityDays: 30 },
    returnTo: 'web',
    checkoutUrl: 'https://pay.flitt.com/x',
    expiresAt: new Date(Date.now() + 10 * 60_000),
    providerStatus: null,
    failureCode: null,
    lastCheckedAt: null,
    settledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function setup(opts: { active?: boolean; attempt?: ReturnType<typeof attemptRow> | null } = {}) {
  const attempt = opts.attempt === undefined ? attemptRow() : opts.attempt;
  const tx = {
    paymentAttempt: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      update: vi.fn(() => Promise.resolve({})),
    },
    order: {
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      findFirst: vi.fn(() => Promise.resolve({ memberId: 'mem-1' })),
    },
    orderStatusEvent: { create: vi.fn(() => Promise.resolve({})) },
    payment: {
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    creditPack: { create: vi.fn(() => Promise.resolve({ id: 'pack-1' })) },
  };
  const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));
  const prisma = {
    client: {
      paymentAttempt: {
        findUnique: vi.fn(() => Promise.resolve(attempt)),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      $transaction,
    },
  } as unknown as PrismaService;
  const integrations = {
    getActiveFlittCredentials: vi.fn(() => Promise.resolve(opts.active ? CREDS : null)),
    getFlittCredentialsForSettlement: vi.fn(() => Promise.resolve(CREDS)),
  } as unknown as IntegrationsService;
  const getOrderStatus = vi.fn();
  const flitt = { getOrderStatus } as unknown as FlittClient;
  const dispatchForGym = vi.fn(() => Promise.resolve(0));
  const service = new OnlinePaymentsService(
    prisma,
    integrations,
    flitt,
    {} as PromoRedemptionService,
    { dispatchForGym } as unknown as AutomationExecutorService,
  );
  return { service, tx, $transaction, getOrderStatus, prisma, dispatchForGym };
}

function signedCallback(over: Record<string, string | number> = {}, secret = SECRET) {
  const body: Record<string, string | number> = {
    order_id: 'att-1',
    merchant_id: 1549901,
    order_status: 'approved',
    amount: '2500',
    currency: 'GEL',
    payment_id: 805243692,
    masked_card: '444455XXXXXX1111',
    ...over,
  };
  return { ...body, signature: signFlittParams(secret, body) };
}

describe('purchase policy', () => {
  beforeEach(() => {
    stub.enabled = true;
  });

  it('refuses with 409 ONLINE_PAYMENTS_UNAVAILABLE when no Flitt is active and the stub is off', async () => {
    stub.enabled = false;
    const { service } = setup({ active: false });
    const error = await service.purchaseMode('gym-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'ONLINE_PAYMENTS_UNAVAILABLE',
    });
    await expect(resolvePurchaseMode(undefined, 'gym-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('falls back to the stub when the flag allows it', async () => {
    const { service } = setup({ active: false });
    await expect(service.purchaseMode('gym-1')).resolves.toEqual({ mode: 'stub' });
    await expect(resolvePurchaseMode(undefined, 'gym-1')).resolves.toEqual({ mode: 'stub' });
  });

  it('prefers the gym’s active Flitt merchant over the stub', async () => {
    const { service } = setup({ active: true });
    await expect(service.purchaseMode('gym-1')).resolves.toEqual({
      mode: 'flitt',
      credentials: CREDS,
    });
  });
});

describe('Flitt callback', () => {
  it('rejects a forged callback without touching the order', async () => {
    const { service, getOrderStatus, $transaction } = setup();
    await expect(service.handleCallback(signedCallback({}, 'not-the-secret'))).resolves.toBe(
      'bad_request',
    );
    expect(getOrderStatus).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });

  it('rejects a callback signed for another merchant id', async () => {
    const { service, getOrderStatus } = setup();
    await expect(service.handleCallback(signedCallback({ merchant_id: 42 }))).resolves.toBe(
      'bad_request',
    );
    expect(getOrderStatus).not.toHaveBeenCalled();
  });

  it('answers unknown_order for an order id it never issued', async () => {
    const { service } = setup({ attempt: null });
    await expect(service.handleCallback(signedCallback())).resolves.toBe('unknown_order');
  });

  it('rejects a body that is not flat signed params', async () => {
    const { service } = setup();
    await expect(service.handleCallback({ order_id: { nested: true } })).resolves.toBe(
      'bad_request',
    );
    await expect(service.handleCallback(null)).resolves.toBe('bad_request');
  });

  it('settles from the re-read status, not the callback’s own', async () => {
    const { service, getOrderStatus, tx } = setup();
    // The callback claims approval; Flitt's authoritative status says declined.
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'declined',
      response_status: 'success',
    });
    await expect(service.handleCallback(signedCallback())).resolves.toBe('accepted');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.creditPack.create).not.toHaveBeenCalled();
    expect(tx.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('does not capture an authentic approval whose amount does not match the attempt', async () => {
    const { service, getOrderStatus, $transaction, prisma } = setup();
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'approved',
      response_status: 'success',
      amount: '100',
      currency: 'GEL',
      merchant_id: 1549901,
      payment_id: 1,
    });
    await expect(service.handleCallback(signedCallback({ amount: '100' }))).resolves.toBe(
      'accepted',
    );
    expect($transaction).not.toHaveBeenCalled();
    expect(prisma.client.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'att-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'NEEDS_REVIEW', failureCode: 'amount_mismatch' }),
      }),
    );
  });
});

describe('settleAttempt', () => {
  it('captures an approval once: claim, order PAID, payment CAPTURED, pack minted', async () => {
    const { service, getOrderStatus, tx, dispatchForGym } = setup();
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'approved',
      response_status: 'success',
      amount: '2500',
      currency: 'GEL',
      merchant_id: 1549901,
      payment_id: 805243692,
    });
    await expect(service.settleAttempt('att-1')).resolves.toEqual({ kind: 'captured' });
    expect(tx.paymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'att-1', status: 'PENDING' } }),
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1', gymId: 'gym-1', status: 'PENDING' } }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CAPTURED', providerRef: '805243692' }),
      }),
    );
    expect(tx.creditPack.create).toHaveBeenCalledTimes(1);
    expect(dispatchForGym).toHaveBeenCalledWith('gym-1', 'purchase_completed', {
      entityId: 'order-1',
      entityType: 'order',
    });
  });

  it('grants nothing when another settler already claimed the attempt', async () => {
    const { service, getOrderStatus, tx } = setup();
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'approved',
      response_status: 'success',
      amount: '2500',
      currency: 'GEL',
      payment_id: 1,
    });
    tx.paymentAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    const outcome = await service.settleAttempt('att-1');
    expect(outcome.kind).toBe('final');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.creditPack.create).not.toHaveBeenCalled();
  });

  it('flags money for an order that is no longer pending instead of granting', async () => {
    const { service, getOrderStatus, tx } = setup();
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'approved',
      response_status: 'success',
      amount: '2500',
      currency: 'GEL',
      payment_id: 1,
    });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.settleAttempt('att-1')).resolves.toEqual({
      kind: 'needs_review',
      reason: 'order_not_pending',
    });
    expect(tx.creditPack.create).not.toHaveBeenCalled();
  });

  it('leaves an attempt untouched while Flitt says it is still processing', async () => {
    const { service, getOrderStatus, $transaction } = setup();
    getOrderStatus.mockResolvedValue({
      order_id: 'att-1',
      order_status: 'processing',
      response_status: 'success',
    });
    await expect(service.settleAttempt('att-1')).resolves.toEqual({
      kind: 'waiting',
      providerStatus: 'processing',
    });
    expect($transaction).not.toHaveBeenCalled();
  });

  it('is a no-op on an attempt that is already final', async () => {
    const { service, getOrderStatus } = setup({
      attempt: attemptRow({ status: PaymentAttemptStatus.CAPTURED }),
    });
    await expect(service.settleAttempt('att-1')).resolves.toEqual({
      kind: 'final',
      status: 'CAPTURED',
    });
    expect(getOrderStatus).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('detects merchant, amount and currency mismatches', () => {
    const attempt = { amount: 2500, currency: 'GEL', merchantId: '1549901' };
    const ok = { order_id: 'a', order_status: 'approved' as const, response_status: 'success' as const };
    expect(paymentMismatch(attempt, { ...ok, amount: '2500', currency: 'GEL' })).toBeNull();
    expect(paymentMismatch(attempt, { ...ok, amount: 2500, currency: 'GEL', merchant_id: 7 })).toBe(
      'merchant_mismatch',
    );
    expect(paymentMismatch(attempt, { ...ok, amount: '2499', currency: 'GEL' })).toBe(
      'amount_mismatch',
    );
    expect(paymentMismatch(attempt, { ...ok, amount: '2500', currency: 'USD' })).toBe(
      'currency_mismatch',
    );
  });

  it('builds the app deep link from the configured scheme', () => {
    expect(buildResultUrl('app', 'order 1', 'downtown')).toBe(
      'fit://checkout/result?orderId=order%201',
    );
    expect(buildResultUrl('web', 'o1', 'downtown')).toMatch(/\/checkout\/result\?orderId=o1$/);
  });
});
