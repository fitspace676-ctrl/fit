import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openAuthSessionAsync } from 'expo-web-browser';
import { usePaymentBrowser } from './usePaymentBrowser';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'synergy' } },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const browser = jest.mocked(openAuthSessionAsync);
const payment = {
  status: 'requires_action' as const,
  orderId: 'ord_1',
  checkoutUrl: 'https://checkout.flitt.com/pay',
  expiresAt: null,
};
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
it('opens an auth browser with the configured callback and remembers shop origin on dismissal', async () => {
  browser.mockResolvedValue({ type: 'cancel' } as Awaited<ReturnType<typeof openAuthSessionAsync>>);
  const { result } = renderHook(() => usePaymentBrowser());
  await act(async () => {
    expect(await result.current(payment, 'shop')).toBe(true);
  });
  expect(browser).toHaveBeenCalledWith(payment.checkoutUrl, 'synergy://checkout/result');
  expect(await AsyncStorage.getItem('payment-destination:ord_1')).toBe('shop');
  expect(mockReplace).toHaveBeenCalledWith('/checkout/result?orderId=ord_1');
});
it('leaves the instant-paid and legacy success paths unchanged', async () => {
  const { result } = renderHook(() => usePaymentBrowser());
  expect(await result.current(undefined)).toBe(false);
  expect(await result.current({ ...payment, status: 'paid', checkoutUrl: null })).toBe(false);
  expect(browser).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
