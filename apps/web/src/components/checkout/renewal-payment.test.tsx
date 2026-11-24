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
  useTranslations: () => (key: string, values?: { date?: string }) =>
    key === 'renewalDue' ? `${key}: ${values?.date}` : key,
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
  const { rerender } = render(<RenewalPayment timeZone="Asia/Tbilisi" payment={payment} overdue={false} />);
  expect(screen.getByRole('button', { name: 'payPeriod' })).toBeEnabled();
  rerender(<RenewalPayment timeZone="Asia/Tbilisi" payment={{ ...payment, canPayNow: false }} overdue={false} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('renewalAmount')).toBeInTheDocument();
  rerender(<RenewalPayment timeZone="Asia/Tbilisi" payment={{ ...payment, mode: 'auto' }} overdue={false} />);
  expect(screen.queryByText('renewalAmount')).toBeNull();
  rerender(<RenewalPayment timeZone="Asia/Tbilisi" overdue={false} />);
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
  render(<RenewalPayment timeZone="Asia/Tbilisi" payment={payment} overdue />);
  expect(screen.getByText('overdue')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  await waitFor(() => expect(mocks.redirect).toHaveBeenCalledWith(action));
  expect(mocks.pay).toHaveBeenCalledOnce();
});
it('resumes a pending order without creating another', () => {
  render(<RenewalPayment timeZone="Asia/Tbilisi" payment={{ ...payment, pendingOrderId: 'o1' }} overdue={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  expect(mocks.push).toHaveBeenCalledWith('/checkout/result?orderId=o1');
  expect(mocks.pay).not.toHaveBeenCalled();
});
it.each([
  ['SUBSCRIPTION_NOT_DUE', 'notDue'],
  ['ONLINE_PAYMENTS_UNAVAILABLE', 'frontDesk'],
])('explains %s', async (code, message) => {
  mocks.pay.mockResolvedValue({ ok: false, code });
  render(<RenewalPayment timeZone="Asia/Tbilisi" payment={payment} overdue={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'payPeriod' }));
  await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
});

it.each(['Asia/Tbilisi', 'America/Los_Angeles'])(
  'shows the renewal due day in %s across midnight',
  (timeZone) => {
    const dueAt = '2026-11-20T21:30:00Z';
    render(<RenewalPayment timeZone={timeZone} payment={{ ...payment, dueAt }} overdue={false} />);
    const expected = new Intl.DateTimeFormat('ka', { timeZone, dateStyle: 'medium' }).format(
      new Date(dueAt),
    );
    expect(screen.getByText(`renewalDue: ${expected}`)).toBeInTheDocument();
  },
);
