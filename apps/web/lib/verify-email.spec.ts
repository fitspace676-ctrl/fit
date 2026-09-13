import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyEmailToken } from './verify-email';

// The verify call names the tenant host it came from, read from the request.
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ host: 'downtown.formacore.io' })),
}));

describe('verifyEmailToken', () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs the API verify route with the url-encoded token, uncached', async () => {
    await verifyEmailToken('a b+c');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/auth/verify?token=a%20b%2Bc');
    expect(init?.cache).toBe('no-store');
    expect(new Headers(init?.headers).get('x-tenant-host')).toBe('downtown.formacore.io');
  });

  it('resolves "verified" when the API accepts the token', async () => {
    await expect(verifyEmailToken('tok')).resolves.toBe('verified');
  });

  it('resolves "invalid" when the API rejects the token', async () => {
    fetchMock.mockResolvedValue(new Response('bad token', { status: 400 }));
    await expect(verifyEmailToken('tok')).resolves.toBe('invalid');
  });

  it('resolves "invalid" when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(verifyEmailToken('tok')).resolves.toBe('invalid');
  });
});
