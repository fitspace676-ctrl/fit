import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { TestIntegrationResponse } from '@fit/types';
import { env } from '../../config/env';
import { signFlittParams, verifyFlittSignature, type FlittParams } from './flitt-signature';

export interface FlittCredentials {
  merchantId: string;
  secretKey: string;
}
export type FlittOrderStatus =
  | 'created'
  | 'processing'
  | 'declined'
  | 'approved'
  | 'expired'
  | 'reversed';
export interface FlittCheckoutInput {
  orderId: string;
  amount: number;
  currency: 'GEL';
  description: string;
  responseUrl: string;
  serverCallbackUrl: string;
  lang?: string;
  merchantData?: string;
  lifetimeSeconds?: number;
  senderEmail?: string;
}
export interface FlittReverseInput {
  orderId: string;
  amount: number;
  currency: 'GEL';
  reverseId?: string;
  comment?: string;
}
export interface FlittCheckoutResult {
  checkout_url: string;
  payment_id: string | number;
  response_status: 'success';
}
export interface FlittOrderResult {
  order_id: string;
  order_status: FlittOrderStatus;
  response_status: 'success';
  amount?: string | number;
  currency?: string;
  payment_id?: string | number;
  reversal_amount?: string | number;
  merchant_data?: string;
}
export interface FlittReverseResult {
  reverse_status: FlittOrderStatus;
  response_status: 'success';
  reverse_id?: string;
  reversal_amount?: string | number;
  transaction_id?: string | number;
}

/** Provider failures are separate from transport/protocol failures. Never stores request params. */
export class FlittApiError extends Error {
  constructor(
    readonly error_code: number,
    readonly error_message: string,
    readonly request_id?: string,
  ) {
    super(`Flitt request failed (${error_code})`);
    this.name = 'FlittApiError';
  }
}
export class FlittTransportError extends Error {
  constructor(
    readonly reason: 'network' | 'timeout' | 'http' | 'invalid_response' | 'invalid_signature',
  ) {
    super(`Flitt transport failed (${reason})`);
    this.name = 'FlittTransportError';
  }
}

/** Stateless multi-tenant transport: credentials belong to the call, never the singleton. */
@Injectable()
export class FlittClient {
  async createCheckout(
    creds: FlittCredentials,
    input: FlittCheckoutInput,
  ): Promise<FlittCheckoutResult> {
    assertAmount(input.amount);
    const reply = await this.request(creds, '/api/checkout/url', {
      order_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      order_desc: input.description,
      response_url: input.responseUrl,
      server_callback_url: input.serverCallbackUrl,
      lang: input.lang,
      merchant_data: input.merchantData,
      lifetime: input.lifetimeSeconds,
      sender_email: input.senderEmail,
    });
    if (typeof reply.checkout_url !== 'string' || !scalarId(reply.payment_id))
      throw new FlittTransportError('invalid_response');
    return reply as unknown as FlittCheckoutResult;
  }

  async getOrderStatus(creds: FlittCredentials, orderId: string): Promise<FlittOrderResult> {
    const reply = await this.request(creds, '/api/status/order_id', { order_id: orderId });
    if (typeof reply.order_id !== 'string' || !isStatus(reply.order_status))
      throw new FlittTransportError('invalid_response');
    return reply as unknown as FlittOrderResult;
  }

  async reverse(creds: FlittCredentials, input: FlittReverseInput): Promise<FlittReverseResult> {
    assertAmount(input.amount);
    const reply = await this.request(creds, '/api/reverse/order_id', {
      order_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      reverse_id: input.reverseId,
      comment: input.comment,
    });
    if (!isStatus(reply.reverse_status)) throw new FlittTransportError('invalid_response');
    return reply as unknown as FlittReverseResult;
  }

  async verifyCredentials(creds: FlittCredentials): Promise<TestIntegrationResponse> {
    try {
      // A read-only, never-created order. Public test merchant returns 1018.
      await this.request(creds, '/api/status/order_id', {
        order_id: `credentials-${randomUUID()}`,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof FlittApiError) {
        if (error.error_code === 1014) return { ok: false, reason: 'bad_key' };
        if (error.error_code === 1016) return { ok: false, reason: 'unknown_merchant' };
        return { ok: true };
      }
      if (error instanceof FlittTransportError) return { ok: false, reason: 'unreachable' };
      throw error;
    }
  }

  private async request(
    creds: FlittCredentials,
    path: string,
    params: FlittParams,
  ): Promise<FlittParams> {
    const request = { ...params, merchant_id: creds.merchantId };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${env.FLITT_API_URL.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          request: { ...request, signature: signFlittParams(creds.secretKey, request) },
        }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new FlittTransportError('http');
      const body: unknown = await response.json();
      if (!isRecord(body) || !isRecord(body.response))
        throw new FlittTransportError('invalid_response');
      const raw = body.response;
      if (
        !Object.values(raw).every(
          (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
        )
      ) {
        throw new FlittTransportError('invalid_response');
      }
      const reply = raw as FlittParams;
      if ('signature' in reply && !verifyFlittSignature(creds.secretKey, reply))
        throw new FlittTransportError('invalid_signature');
      if (reply.response_status === 'failure') {
        const code = Number(reply.error_code);
        if (!Number.isInteger(code) || typeof reply.error_message !== 'string')
          throw new FlittTransportError('invalid_response');
        // Test-mode errors may echo a signing string. Redact the supplied key;
        // callers must never persist provider-controlled text in audit/lastError.
        const safe = (value: string) =>
          creds.secretKey ? value.split(creds.secretKey).join('[redacted]') : value;
        throw new FlittApiError(
          code,
          safe(reply.error_message),
          typeof reply.request_id === 'string' ? safe(reply.request_id) : undefined,
        );
      }
      if (reply.response_status !== 'success') throw new FlittTransportError('invalid_response');
      // Debug strings are not part of the application contract.
      const { signature: _signature, response_signature_string: _debug, ...result } = reply;
      return result;
    } catch (error) {
      if (error instanceof FlittApiError || error instanceof FlittTransportError) throw error;
      if (controller.signal.aborted) throw new FlittTransportError('timeout');
      if (error instanceof SyntaxError) throw new FlittTransportError('invalid_response');
      throw new FlittTransportError('network');
    } finally {
      clearTimeout(timer);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function scalarId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}
function isStatus(value: unknown): value is FlittOrderStatus {
  return (
    typeof value === 'string' &&
    ['created', 'processing', 'declined', 'approved', 'expired', 'reversed'].includes(value)
  );
}
function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new RangeError('Flitt amount must be a positive integer in minor units');
}
