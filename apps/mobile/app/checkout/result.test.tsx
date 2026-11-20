/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- jest mocks */
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PaymentResultScreen from './result';
import { renderScreen } from '../../test-support/render-screen';

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ orderId: 'ord_1' }),
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
