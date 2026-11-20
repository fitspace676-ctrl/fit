import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/env', () => ({ env: { FLITT_API_URL: 'https://pay.flitt.com' } }));
import { FlittApiError, FlittClient, FlittTransportError } from './flitt-client';
import { signFlittParams, type FlittParams } from './flitt-signature';

const creds = { merchantId: '1549901', secretKey: 'test' };
const fetchMock = vi.fn<typeof fetch>();
const client = new FlittClient();
function reply(response: object) {
  return new Response(JSON.stringify({ response }));
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('FlittClient', () => {
  it('posts a signed checkout envelope with optional fields and explicit credentials', async () => {
    fetchMock.mockResolvedValue(
      reply({
        response_status: 'success',
        checkout_url: 'https://pay.flitt.com/order',
        payment_id: '123',
      }),
    );
    await client.createCheckout(creds, {
      orderId: 'order-1',
      amount: 1000,
      currency: 'GEL',
      description: 'ქართული',
      responseUrl: 'https://gym.test/done',
      serverCallbackUrl: 'https://api.test/callback',
      lang: 'ka',
      merchantData: 'opaque',
      lifetimeSeconds: 300,
      senderEmail: 'member@example.com',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://pay.flitt.com/api/checkout/url');
    const { request } = JSON.parse(init!.body as string) as { request: FlittParams };
    expect(init!.method).toBe('POST');
    expect(request).toMatchObject({
      merchant_id: '1549901',
      amount: 1000,
      order_desc: 'ქართული',
      lifetime: 300,
      merchant_data: 'opaque',
      lang: 'ka',
    });
    expect(request.signature).toBe(signFlittParams('test', request));
    expect(request).not.toHaveProperty('secretKey');
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });
  it('uses each call’s merchant and includes the idempotent reversal ID', async () => {
    fetchMock.mockResolvedValue(reply({ response_status: 'success', reverse_status: 'approved' }));
    await client.reverse(
      { merchantId: '2', secretKey: 'other-key' },
      { orderId: 'o', amount: 1, currency: 'GEL', reverseId: 'r', comment: 'refund' },
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    const { request } = JSON.parse(init!.body as string) as { request: FlittParams };
    expect(url).toBe('https://pay.flitt.com/api/reverse/order_id');
    expect(request).toMatchObject({ merchant_id: '2', reverse_id: 'r', comment: 'refund' });
    expect(request.signature).toBe(signFlittParams('other-key', request));
  });
  it('checks a signed status response and rejects tampering', async () => {
    const response = {
      response_status: 'success',
      order_status: 'approved',
      order_id: 'o',
      amount: '100',
    };
    const signature = signFlittParams('test', response);
    fetchMock.mockResolvedValueOnce(
      reply({ ...response, signature, response_signature_string: 'debug' }),
    );
    expect(await client.getOrderStatus(creds, 'o')).toEqual(response);
    fetchMock.mockResolvedValueOnce(reply({ ...response, amount: '200', signature }));
    await expect(client.getOrderStatus(creds, 'o')).rejects.toMatchObject({
      reason: 'invalid_signature',
    });
  });
  it.each([
    [1014, 'bad_key'],
    [1016, 'unknown_merchant'],
    [1018, undefined],
    [1000, undefined],
  ])('maps credential error %s', async (code, reason) => {
    fetchMock.mockResolvedValue(
      reply({
        response_status: 'failure',
        error_code: code,
        error_message: 'Provider error',
        request_id: 'r',
      }),
    );
    expect(await client.verifyCredentials(creds)).toEqual(
      reason ? { ok: false, reason } : { ok: true },
    );
    const { request } = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      request: FlittParams;
    };
    expect(request.order_id).toMatch(/^credentials-/);
  });
  it('accepts a success credential probe', async () => {
    fetchMock.mockResolvedValue(reply({ response_status: 'success' }));
    expect(await client.verifyCredentials(creds)).toEqual({ ok: true });
  });
  it('preserves typed provider fields while redacting a key echoed in errors', async () => {
    fetchMock.mockResolvedValue(
      reply({
        response_status: 'failure',
        error_code: 1014,
        error_message: 'Invalid signature test|100',
        request_id: 'r',
      }),
    );
    const error = await client.getOrderStatus(creds, 'o').catch((error: unknown) => error);
    expect(error).toBeInstanceOf(FlittApiError);
    expect(error).toMatchObject({
      error_code: 1014,
      error_message: 'Invalid signature [redacted]|100',
      request_id: 'r',
    });
  });
  it('classifies network/HTTP/malformed responses without propagating raw details', async () => {
    fetchMock.mockRejectedValueOnce(new Error('test secret in network exception'));
    await expect(client.getOrderStatus(creds, 'o')).rejects.toMatchObject({
      reason: 'network',
      message: 'Flitt transport failed (network)',
    });
    fetchMock.mockResolvedValueOnce(new Response('secret', { status: 503 }));
    await expect(client.getOrderStatus(creds, 'o')).rejects.toMatchObject({ reason: 'http' });
    fetchMock.mockResolvedValueOnce(new Response('not json'));
    await expect(client.getOrderStatus(creds, 'o')).rejects.toBeInstanceOf(FlittTransportError);
    fetchMock.mockResolvedValueOnce(reply({}));
    expect(await client.verifyCredentials(creds)).toEqual({ ok: false, reason: 'unreachable' });
  });
  it('aborts after 15 seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = client.verifyCredentials(creds);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, reason: 'unreachable' });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-minor-unit amount %s before fetching',
    async (amount) => {
      await expect(
        client.reverse(creds, { orderId: 'o', amount, currency: 'GEL' }),
      ).rejects.toBeInstanceOf(RangeError);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
