import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { OrderSummary, OrderPaymentStatus } from '@fit/types';
import { PaymentResult } from './payment-result';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), redirect: vi.fn(), missing: vi.fn() }));
vi.mock('@/src/i18n/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('next/navigation', () => ({ notFound: () => { mocks.missing(); throw new Error('not found'); } }));
vi.mock('./online-payments', () => ({
  paymentErrorKey: (code: string) => code ?? 'error',
  useOnlinePayment: () => ({ t: (key: string) => key, redirecting: false, redirect: mocks.redirect }),
}));
function order(status: OrderPaymentStatus): OrderSummary {
  return { id: 'o1', status: status === 'paid' ? 'paid' : 'pending', total: 100, currency: 'GEL', items: [{ label: 'Ten credits', amount: 100 }], payment: { status, provider: 'flitt', retry: status !== 'paid' && status !== 'refunded', checkoutUrl: null, expiresAt: null } };
}
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(status: OrderPaymentStatus) {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ order: order(status) }) });
  await act(async () => { render(<PaymentResult initialOrder={order(status)} />); });
}
it('syncs on arrival, confirms paid orders and stops polling', async () => {
  await mount('paid');
  expect(fetchMock).toHaveBeenCalledWith('/api/checkout/o1/payment/sync', expect.objectContaining({ method: 'POST' }));
  expect(mocks.replace).toHaveBeenCalledWith('/member/checkout/success?orderId=o1');
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(['pending', 'requires_action'] as const)('stops %s polling at 30 seconds and offers retry', async (status) => {
  await mount(status);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(screen.getByRole('status')).toHaveTextContent('incomplete');
  expect(screen.getByRole('button', { name: 'retry' })).toBeVisible();
  const calls = fetchMock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(fetchMock).toHaveBeenCalledTimes(calls);
});
it.each(['failed', 'expired'] as const)('offers retry immediately for %s and opens returned payment', async (status) => {
  await mount(status);
  const payment = { status: 'requires_action', checkoutUrl: 'https://pay.flitt.com/test' };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ payment }) });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'retry' })); });
  expect(fetchMock).toHaveBeenLastCalledWith('/api/checkout/o1/payment/retry', { method: 'POST' });
  expect(mocks.redirect).toHaveBeenCalledWith(payment);
});
it('cancels an unpaid order', async () => {
  await mount('failed');
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'cancel' })); });
  expect(fetchMock).toHaveBeenLastCalledWith('/api/checkout/o1/payment/cancel', { method: 'POST' });
  expect(screen.getByRole('status')).toHaveTextContent('cancelled');
  expect(screen.queryByRole('button', { name: 'retry' })).toBeNull();
});
it('shows a neutral refund notice without payment actions', async () => {
  await mount('refunded');
  expect(screen.getByRole('status')).toHaveTextContent('refunded');
  expect(screen.queryByRole('button', { name: 'retry' })).toBeNull();
});
it('stops scheduled checks on unmount', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ order: order('pending') }) });
  const view = render(<PaymentResult initialOrder={order('pending')} />);
  await act(async () => {});
  view.unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
