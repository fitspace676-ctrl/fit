/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- jest mocks */
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PaymentResultScreen from './result';
import { renderScreen } from '../../test-support/render-screen';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
let mockParams: Record<string, string> = { orderId: 'ord_1' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../hooks/useActiveGym', () => ({ useGymId: () => 'gym_1' }));
const mockOpen = jest.fn();
jest.mock('../../hooks/usePaymentBrowser', () => ({
  usePaymentBrowser: () => mockOpen,
  paymentDestinationKey: (id: string) => `payment-destination:${id}`,
}));
const mockSync = jest.fn();
const mockRetry = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../lib/api/payments', () => ({
  syncOrderPayment: (...args: unknown[]) => mockSync(...args),
  retryOrderPayment: (...args: unknown[]) => mockRetry(...args),
  cancelOrderPayment: (...args: unknown[]) => mockCancel(...args),
}));
const payment = {
  status: 'requires_action',
  orderId: 'ord_1',
  checkoutUrl: 'https://checkout.flitt.com/pay',
  expiresAt: null,
};
function result(status: string) {
  return {
    order: {
      id: 'ord_1',
      status: status === 'paid' ? 'paid' : 'pending',
      total: 100,
      currency: 'GEL',
      items: [],
      payment: {
        status,
        provider: 'flitt',
        retry: status !== 'paid',
        checkoutUrl: payment.checkoutUrl,
        expiresAt: null,
      },
    },
  };
}
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams = { orderId: 'ord_1' };
  await AsyncStorage.clear();
  mockSync.mockResolvedValue(result('failed'));
  mockRetry.mockResolvedValue({ payment });
  mockCancel.mockResolvedValue({});
  mockOpen.mockResolvedValue(true);
});
it('syncs on arrival, routes paid join orders to the receipt and invalidates balances', async () => {
  await AsyncStorage.setItem('payment-destination:ord_1', 'join');
  mockSync.mockResolvedValue(result('paid'));
  const screen = renderScreen(<PaymentResultScreen />);
  const invalidate = jest.spyOn(screen.client, 'invalidateQueries');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/checkout-success?orderId=ord_1'));
  expect(mockSync).toHaveBeenCalledWith(
    'ord_1',
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['creditPacks', 'gym_1'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['myOrders', 'gym_1'] });
});
it('routes paid shop orders to the order screen', async () => {
  await AsyncStorage.setItem('payment-destination:ord_1', 'shop');
  mockSync.mockResolvedValue(result('paid'));
  renderScreen(<PaymentResultScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/shop/order/ord_1'));
});
it('shows unpaid state, retries the existing order and resumes sync after dismissal', async () => {
  const screen = renderScreen(<PaymentResultScreen />);
  fireEvent.press(await screen.findByTestId('payment-retry'));
  await waitFor(() => expect(mockRetry).toHaveBeenCalledWith('ord_1'));
  expect(mockOpen).toHaveBeenCalledWith(payment, 'shop');
  await waitFor(() => expect(mockSync.mock.calls.length).toBeGreaterThan(1));
  expect(mockReplace).not.toHaveBeenCalled();
});
it('cancels an unpaid order, then shows its order details', async () => {
  const screen = renderScreen(<PaymentResultScreen />);
  fireEvent.press(await screen.findByTestId('payment-cancel'));
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('ord_1'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/shop/order/ord_1'));
});
it('keeps the buyer on the result screen when cancellation is refused', async () => {
  mockCancel.mockRejectedValue(new Error('PAYMENT_IN_PROGRESS'));
  const screen = renderScreen(<PaymentResultScreen />);
  fireEvent.press(await screen.findByTestId('payment-cancel'));
  await screen.findByText('Could not update payment. Check again before placing another order.');
  expect(mockReplace).not.toHaveBeenCalled();
});

it('returns a paid renewal to membership and invalidates its query', async () => {
  await AsyncStorage.setItem('payment-destination:ord_1', 'membership');
  mockSync.mockResolvedValue(result('paid'));
  const screen = renderScreen(<PaymentResultScreen />);
  const invalidate = jest.spyOn(screen.client, 'invalidateQueries');
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profile/membership'));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['membership', 'gym_1'] });
});
it('preserves membership destination when retrying a renewal', async () => {
  await AsyncStorage.setItem('payment-destination:ord_1', 'membership');
  const screen = renderScreen(<PaymentResultScreen />);
  fireEvent.press(await screen.findByTestId('payment-retry'));
  await waitFor(() => expect(mockOpen).toHaveBeenCalledWith(payment, 'membership'));
});

it('asks once and says nothing was charged when the buyer closed the payment page', async () => {
  mockParams = { orderId: 'ord_1', dismissed: '1' };
  mockSync.mockResolvedValue(result('requires_action'));
  const screen = renderScreen(<PaymentResultScreen />);
  await screen.findByTestId('payment-state-notPaid');
  screen.getByText('Payment not completed');
  screen.getByText('Nothing was charged. Continue the payment or cancel the order.');
  screen.getByText('Complete payment');
  expect(mockSync).toHaveBeenCalledTimes(1);
});
it('shows the bank is processing while it keeps asking, then follows the paid order', async () => {
  const processing = result('requires_action');
  Object.assign(processing.order.payment, { processing: true });
  let settle: (value: unknown) => void = () => undefined;
  mockSync.mockResolvedValueOnce(processing).mockReturnValueOnce(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  const screen = renderScreen(<PaymentResultScreen />);
  await screen.findByTestId('payment-state-processing', {}, { timeout: 4000 });
  screen.getByText('The bank is processing your payment');
  expect(screen.queryByTestId('payment-retry')).toBeNull();
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2), { timeout: 4000 });
  settle(result('paid'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/shop/order/ord_1'));
});
it('draws the order total and a declined payment as failed', async () => {
  const screen = renderScreen(<PaymentResultScreen />);
  await screen.findByTestId('payment-state-failed');
  screen.getByText('The payment did not go through. Nothing was charged.');
  screen.getByTestId('payment-summary');
  screen.getByText('Total');
  screen.getByText('Try again');
});
