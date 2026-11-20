import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { openAuthSessionAsync } from 'expo-web-browser';
import type { PaymentAction } from '@fit/types';
import { launchPayment, paymentResultPath, paymentScheme } from '../lib/payment-flow';

export const paymentDestinationKey = (orderId: string) => `payment-destination:${orderId}`;
export function usePaymentBrowser() {
  const router = useRouter();
  return async (payment: PaymentAction | undefined, destination: 'shop' | 'join' = 'join') => {
    if (payment?.status !== 'requires_action') return false;
    // Retain the destination across a cold-start deep link as well as dismissal.
    await AsyncStorage.setItem(paymentDestinationKey(payment.orderId), destination).catch(
      () => undefined,
    );
    try {
      return await launchPayment(payment, {
        scheme: paymentScheme(Constants.expoConfig?.scheme),
        open: openAuthSessionAsync,
        result: (path) => router.replace(path),
      });
    } catch {
      // Configuration/browser failure still recovers the existing order.
      router.replace(paymentResultPath(payment.orderId));
      return true;
    }
  };
}
