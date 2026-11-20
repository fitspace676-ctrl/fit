import type { GetOrderResponse, RetryOrderPaymentResponse } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

export function syncOrderPayment(orderId: string, options: FetchOptions = {}) {
  return apiJson<GetOrderResponse>(endpointPath(ENDPOINTS.syncOrderPayment, { orderId }), {
    method: 'POST',
    signal: options.signal,
  });
}
export function retryOrderPayment(orderId: string) {
  return apiJson<RetryOrderPaymentResponse>(
    endpointPath(ENDPOINTS.retryOrderPayment, { orderId }),
    {
      method: 'POST',
      json: { returnTo: 'app' },
    },
  );
}
export function cancelOrderPayment(orderId: string) {
  return apiJson<unknown>(endpointPath(ENDPOINTS.cancelOrderPayment, { orderId }), {
    method: 'POST',
  });
}
