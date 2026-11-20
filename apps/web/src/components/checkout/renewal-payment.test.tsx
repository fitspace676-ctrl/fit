import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MeSubscriptionPayment } from '@fit/types';
import { RenewalPayment } from '@/app/[locale]/member/(member)/account/membership/renewal-payment';

const mocks = vi.hoisted(() => ({
  pay: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'ka',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/src/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('@/app/actions/subscription-payment', () => ({ paySubscriptionAction: mocks.pay }));
vi.mock('@/src/components/checkout/online-payments', () => ({
  useOnlinePayment: () => ({ redirect: mocks.redirect, redirecting: false }),
}));
const payment: MeSubscriptionPayment = {
  mode: 'manual',
  canPayNow: true,
  dueAt: '2026-11-20T00:00:00Z',
  amount: 5000,
  currency: 'GEL',
  pendingOrderId: null,
};
beforeEach(() => vi.clearAllMocks());
it('shows Pay only when canPayNow, and hides absent/auto payment', () => {
  const { rerender } = render(<RenewalPayment payment={payment} overdue={false} />);
  expect(screen.getByRole('button', { name: 'payPeriod' })).toBeEnabled();
  rerender(<RenewalPayment payment={{ ...payment, canPayNow: false }} overdue={false} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('renewalAmount')).toBeInTheDocument();
  rerender(<RenewalPayment payment={{ ...payment, mode: 'auto' }} overdue={false} />);
  expect(screen.queryByText('renewalAmount')).toBeNull();
  rerender(<RenewalPayment overdue={false} />);
  expect(screen.queryByRole('button')).toBeNull();
});
it('pays through the existing hosted payment mechanism', async () => {
  const action = {
    status: 'requires_action',
    orderId: 'o1',
    checkoutUrl: 'https://pay.example',
    expiresAt: null,
  };
  mocks.pay.mockResolvedValue({ ok: true, data: { payment: action } });
  mocks.redirect.mockReturnValue(true);
  render(<RenewalPayment payment={payment} overdue />);
  expect(screen.getByText('overdue')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(action));
  expect(mocks.pay).toHaveBeenCalledOnce();
});
it('resumes a pending order without creating another', () => {
  render(<RenewalPayment payment={{ ...payment, pendingOrderId: 'o1' }} overdue={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  expect(mocks.push).toHaveBeenCalledWith('/checkout/result?orderId=o1');
  expect(mocks.pay).not.toHaveBeenCalled();
});
it.each([
  ['SUBSCRIPTION_NOT_DUE', 'notDue'],
  ['ONLINE_PAYMENTS_UNAVAILABLE', 'frontDesk'],
])('explains %s', async (code, message) => {
  mocks.pay.mockResolvedValue({ ok: false, code });
  render(<RenewalPayment payment={payment} overdue={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
});
