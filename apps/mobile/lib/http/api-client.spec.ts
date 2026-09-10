import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../env';
import { queryClient } from '../query-client';
import {
  endSession,
  getAccessToken,
  getSessionSnapshot,
  saveTokens,
  setSecureStorage,
  type SecureStorageAdapter,
} from '../auth/token-store';
import { ApiError } from './api-error';
import {
  apiFetch,
  apiJson,
  apiResult,
  buildUrl,
  getCartOrEmpty,
  resetApiClientForTests,
} from './api-client';

// ─── fixtures ───────────────────────────────────────────────────────────────

const BASE = env.apiUrl;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** A JWS-shaped access token carrying a decodable `gymId`. */
function accessToken(id: string): string {
  return `h.${base64url(JSON.stringify({ sub: 'user_1', gymId: 'gym_a', role: 'MEMBER', exp: 4_000_000_000, jti: id }))}.s`;
}

const OLD_ACCESS = accessToken('old');
const NEW_ACCESS = accessToken('new');

function fakeStorage(): SecureStorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** The API's error envelope, verbatim from `AllExceptionsFilter`. */
function envelope(code: string, message: string, details: string[] | null = null) {
  return { code, message, details, requestId: 'req-42' };
}

type FetchArgs = [string, RequestInit];

/**
 * Install a `fetch` stub. `handler` sees the URL and init of every call —
 * including the refresh, so a test can count `/auth/refresh` hits directly.
 */
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const mock = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', mock);
  return mock;
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

function refreshCalls(mock: ReturnType<typeof stubFetch>): FetchArgs[] {
  return (mock.mock.calls as unknown as FetchArgs[]).filter(([url]) =>
    url.endsWith('/auth/refresh'),
  );
}

// ─── suite ──────────────────────────────────────────────────────────────────

describe('api-client', () => {
  beforeEach(() => {
    setSecureStorage(fakeStorage());
    resetApiClientForTests();
    queryClient.clear();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // A working backend, so teardown can always reach the signed-out state.
    setSecureStorage(fakeStorage());
    await endSession();
    setSecureStorage(null);
  });

  describe('the request', () => {
    it('attaches the Bearer token from the in-memory snapshot', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch(() => json(200, { ok: true }));

      await apiJson('/membership');

      const [url, init] = mock.mock.calls[0] as unknown as FetchArgs;
      expect(url).toBe(`${BASE}/membership`);
      expect(headerOf(init, 'Authorization')).toBe(`Bearer ${OLD_ACCESS}`);
    });

    it('sends Accept: application/json and never a cookie', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch(() => json(200, {}));

      await apiJson('/membership');

      const [, init] = mock.mock.calls[0] as unknown as FetchArgs;
      expect(headerOf(init, 'Accept')).toBe('application/json');
      // D3: CartIdentityMiddleware scopes a signed-in cart by the Bearer token;
      // `fit_cart_sid` is the web guest's path and must never leak in from here.
      expect(init.credentials).toBe('omit');
    });

    it('omits Authorization when signed out, and when the caller asks it to', async () => {
      const mock = stubFetch(() => json(200, {}));

      await apiJson('/classes');
      expect(
        headerOf((mock.mock.calls[0] as unknown as FetchArgs)[1], 'Authorization'),
      ).toBeUndefined();

      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      await apiJson('/auth/login', { method: 'POST', json: {}, anonymous: true });
      expect(
        headerOf((mock.mock.calls[1] as unknown as FetchArgs)[1], 'Authorization'),
      ).toBeUndefined();
    });

    it('serialises a JSON body and stamps Content-Type', async () => {
      const mock = stubFetch(() => json(200, {}));
      await apiJson('/cart/items', { method: 'POST', json: { variantId: 'p1:base', qty: 2 } });

      const [, init] = mock.mock.calls[0] as unknown as FetchArgs;
      expect(init.method).toBe('POST');
      expect(headerOf(init, 'Content-Type')).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual({ variantId: 'p1:base', qty: 2 });
    });

    it('builds a query string, dropping undefined and null', () => {
      expect(buildUrl('/classes', { from: '2026-08-30', page: 2, mine: true })).toBe(
        `${BASE}/classes?from=2026-08-30&page=2&mine=true`,
      );
      // Otherwise these arrive as the literal strings "undefined" / "null" and
      // the API's Zod parse rejects the whole request.
      expect(buildUrl('/classes', { a: undefined, b: null })).toBe(`${BASE}/classes`);
      expect(buildUrl('classes')).toBe(`${BASE}/classes`);
    });
  });

  describe('throwing on non-2xx (D7)', () => {
    it('throws an ApiError carrying the parsed envelope', async () => {
      stubFetch(() =>
        json(404, envelope('NOT_FOUND', 'Class not found'), { 'x-request-id': 'req-42' }),
      );

      // The old client returned the Response unthrown, so every hook had to
      // write `if (!res.ok) throw` by hand — and screens did not.
      const error = await apiJson('/classes/nope').catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(404);
      expect((error as ApiError).code).toBe('NOT_FOUND');
      expect((error as ApiError).message).toBe('Class not found');
      expect((error as ApiError).requestId).toBe('req-42');
    });

    it('keeps a handler-stamped domain code and its details', async () => {
      stubFetch(() =>
        json(400, envelope('VALIDATION_ERROR', 'Validation failed', ['email: Invalid email'])),
      );
      const error = (await apiJson('/auth/register', {
        method: 'POST',
        json: {},
        anonymous: true,
      }).catch((thrown: unknown) => thrown)) as ApiError;

      expect(error.details).toEqual(['email: Invalid email']);
    });

    it('falls back to the status-derived code when the body is not JSON', async () => {
      stubFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
      const error = (await apiJson('/membership').catch((thrown: unknown) => thrown)) as ApiError;
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.status).toBe(502);
    });

    it('parses Retry-After on a 429', async () => {
      stubFetch(() =>
        json(429, envelope('RATE_LIMITED', 'Too many requests'), { 'Retry-After': '12' }),
      );
      const error = (await apiJson('/auth/login', {
        method: 'POST',
        json: {},
        anonymous: true,
      }).catch((thrown: unknown) => thrown)) as ApiError;

      expect(error.status).toBe(429);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryAfterSec).toBe(12);
    });

    it('resolves a 204 to undefined rather than throwing on an empty body', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() => new Response(null, { status: 204 }));
      // POST /auth/logout is 204 No Content.
      await expect(
        apiJson('/auth/logout', { method: 'POST', json: { refreshToken: 'r1' } }),
      ).resolves.toBeUndefined();
    });

    it('throws MALFORMED_RESPONSE when a 200 body is not JSON', async () => {
      stubFetch(() => new Response('<html>hi</html>', { status: 200 }));
      const error = (await apiJson('/membership').catch((thrown: unknown) => thrown)) as ApiError;
      expect(error.code).toBe('MALFORMED_RESPONSE');
    });
  });

  describe('401 → refresh → retry once', () => {
    it('refreshes and retries, and the retry carries the NEW token', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch((url, init) => {
        if (url.endsWith('/auth/refresh')) {
          return json(200, { accessToken: NEW_ACCESS, refreshToken: 'r2' });
        }
        return headerOf(init, 'Authorization') === `Bearer ${NEW_ACCESS}`
          ? json(200, { status: 'ACTIVE' })
          : json(401, envelope('ACCESS_TOKEN_INVALID', 'Access token is invalid or has expired'));
      });

      await expect(apiJson('/membership')).resolves.toEqual({ status: 'ACTIVE' });

      expect(mock).toHaveBeenCalledTimes(3);
      expect(refreshCalls(mock)).toHaveLength(1);
      // The rotated pair is persisted, so the next launch resumes the session.
      expect(getSessionSnapshot()).toEqual({ accessToken: NEW_ACCESS, refreshToken: 'r2' });
    });

    it('replays the same body on the retry', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch((url, init) => {
        if (url.endsWith('/auth/refresh')) {
          return json(200, { accessToken: NEW_ACCESS, refreshToken: 'r2' });
        }
        return headerOf(init, 'Authorization') === `Bearer ${NEW_ACCESS}`
          ? json(200, {})
          : json(401, envelope('UNAUTHORIZED', 'nope'));
      });

      await apiJson('/cart/items', { method: 'POST', json: { variantId: 'p1:base', qty: 1 } });

      const bodies = (mock.mock.calls as unknown as FetchArgs[])
        .filter(([url]) => url.endsWith('/cart/items'))
        .map(([, init]) => init.body);
      // A stream body would already be consumed by now; serialising once here is
      // what makes the retry send the same bytes instead of nothing.
      expect(bodies).toEqual([
        JSON.stringify({ variantId: 'p1:base', qty: 1 }),
        JSON.stringify({ variantId: 'p1:base', qty: 1 }),
      ]);
    });

    it('makes exactly ONE POST /auth/refresh for N concurrent 401s', async () => {
      // The home screen fans out to eight endpoints. If each 401 refreshed for
      // itself, the first would win and the rest would be classified as token
      // reuse — and `revokeFamily` would sign the user out of a healthy session.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch((url, init) => {
        if (url.endsWith('/auth/refresh')) {
          return json(200, { accessToken: NEW_ACCESS, refreshToken: 'r2' });
        }
        return headerOf(init, 'Authorization') === `Bearer ${NEW_ACCESS}`
          ? json(200, { path: url })
          : json(401, envelope('ACCESS_TOKEN_INVALID', 'expired'));
      });

      const paths = ['/membership', '/bookings', '/classes', '/cart', '/notifications', '/goals'];
      const results = await Promise.all(paths.map((path) => apiJson<{ path: string }>(path)));

      expect(refreshCalls(mock)).toHaveLength(1);
      expect(results.map((r) => r.path)).toEqual(paths.map((p) => `${BASE}${p}`));
    });

    it('does not start a second refresh for a 401 that lands AFTER one finished', async () => {
      // The gap the deleted app's singleton left. Its `refreshInFlight` was back
      // at null by the time a slow request's 401 arrived, so that request
      // started a second refresh — spending the token that had just been minted,
      // which the server reads as reuse and answers by revoking the family.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });

      let releaseLate!: () => void;
      const latePending = new Promise<void>((resolve) => {
        releaseLate = resolve;
      });

      const mock = stubFetch(async (url, init) => {
        if (url.endsWith('/auth/refresh')) {
          return json(200, { accessToken: NEW_ACCESS, refreshToken: 'r2' });
        }
        const fresh = headerOf(init, 'Authorization') === `Bearer ${NEW_ACCESS}`;
        if (url.endsWith('/bookings') && !fresh) {
          // Hold this attempt open past the whole refresh + retry of the other.
          await latePending;
        }
        return fresh ? json(200, {}) : json(401, envelope('ACCESS_TOKEN_INVALID', 'expired'));
      });

      const late = apiJson('/bookings');
      await apiJson('/membership'); // 401 → the one refresh → retry → 200
      releaseLate();

      await expect(late).resolves.toEqual({});
      expect(refreshCalls(mock)).toHaveLength(1);
    });

    it('never re-enters apiFetch on the refresh path', async () => {
      // If the refresh went through apiFetch, its own 401 would trigger another
      // refresh, forever. Exactly one /auth/refresh proves the recursion is not
      // there; refresh-gate.spec.ts asserts the import cannot come back.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const mock = stubFetch((url) =>
        url.endsWith('/auth/refresh')
          ? json(401, envelope('REFRESH_TOKEN_INVALID', 'gone'))
          : json(401, envelope('ACCESS_TOKEN_INVALID', 'expired')),
      );

      await expect(apiJson('/membership')).rejects.toBeInstanceOf(ApiError);

      expect(refreshCalls(mock)).toHaveLength(1);
      expect(mock).toHaveBeenCalledTimes(2);
    });
  });

  describe('the session ending', () => {
    it('clears tokens AND the query cache when the refresh is rejected', async () => {
      // Defect #3: the old handler only did router.replace('/login'), leaving
      // every gym-scoped entry alive — so re-login as a different member
      // rendered the previous member's data.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      queryClient.setQueryData(['membership', 'gym_a'], { status: 'ACTIVE' });
      stubFetch((url) =>
        url.endsWith('/auth/refresh')
          ? json(401, envelope('REFRESH_TOKEN_INVALID', 'The family was revoked'))
          : json(401, envelope('ACCESS_TOKEN_INVALID', 'expired')),
      );

      const error = (await apiJson('/membership').catch((thrown: unknown) => thrown)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(401);
      expect(getAccessToken()).toBeNull();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('clears the session when a FRESH token is also rejected', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      queryClient.setQueryData(['profile', 'gym_a'], { name: 'A' });
      const mock = stubFetch((url) =>
        url.endsWith('/auth/refresh')
          ? json(200, { accessToken: NEW_ACCESS, refreshToken: 'r2' })
          : json(401, envelope('UNAUTHORIZED', 'Account disabled')),
      );

      await expect(apiJson('/profile')).rejects.toBeInstanceOf(ApiError);

      // Retried exactly once — never twice.
      expect(mock).toHaveBeenCalledTimes(3);
      expect(getAccessToken()).toBeNull();
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('does NOT end the session when the refresh could not be delivered', async () => {
      // Being in a lift is not a reason to sign someone out.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch((url) => {
        if (url.endsWith('/auth/refresh')) {
          return Promise.reject(new TypeError('Network request failed'));
        }
        return json(401, envelope('ACCESS_TOKEN_INVALID', 'expired'));
      });

      await expect(apiJson('/membership')).rejects.toBeInstanceOf(ApiError);
      expect(getAccessToken()).toBe(OLD_ACCESS);
    });

    it('does not try to refresh a 401 received while signed out', async () => {
      const mock = stubFetch(() => json(401, envelope('UNAUTHORIZED', 'no session')));
      await expect(apiJson('/membership')).rejects.toBeInstanceOf(ApiError);
      expect(mock).toHaveBeenCalledTimes(1);
      expect(refreshCalls(mock)).toHaveLength(0);
    });
  });

  describe('the timeout (defect #4)', () => {
    it('aborts after 15s and surfaces NETWORK_TIMEOUT', async () => {
      vi.useFakeTimers();
      stubFetch(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      const pending = apiJson('/membership').catch((thrown: unknown) => thrown);
      await vi.advanceTimersByTimeAsync(env.requestTimeoutMs);
      const error = (await pending) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe('NETWORK_TIMEOUT');
      expect(error.status).toBe(0);
    });

    it('surfaces a transport failure as NETWORK_ERROR, not a timeout', async () => {
      stubFetch(() => Promise.reject(new TypeError('Network request failed')));
      const error = (await apiJson('/membership').catch((thrown: unknown) => thrown)) as ApiError;
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.status).toBe(0);
    });

    it('propagates a caller cancellation verbatim, not as an ApiError', async () => {
      // TanStack Query must see a cancellation as a cancellation, not render an
      // error state on a screen the user already navigated away from.
      const controller = new AbortController();
      stubFetch(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      );

      const pending = apiJson('/membership', { signal: controller.signal }).catch(
        (thrown: unknown) => thrown,
      );
      controller.abort();
      const error = await pending;

      expect(error).not.toBeInstanceOf(ApiError);
      expect((error as Error).name).toBe('AbortError');
    });
  });

  describe('documented exception #1 — POST /cart/checkout', () => {
    it('returns 409 PRICE_CHANGED as a result so newPrices survives', async () => {
      // cart.controller.ts hand-sets these statuses with `res.status(...)` and a
      // normal return, precisely so the global filter never flattens the extra
      // fields. Throwing an ApiError here would drop the only data the screen
      // needs to tell the buyer what changed.
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() =>
        json(409, {
          code: 'PRICE_CHANGED',
          newPrices: [{ variantId: 'p1:base', priceAmount: 4500 }],
        }),
      );

      const result = await apiResult<{ orderId: string }, { code: string; newPrices: unknown[] }>(
        '/cart/checkout',
        {
          method: 'POST',
          json: { fulfillment: 'PICKUP', locationId: 'l1' },
          acceptStatuses: [409, 422],
        },
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
      expect(result.data).toEqual({
        code: 'PRICE_CHANGED',
        newPrices: [{ variantId: 'p1:base', priceAmount: 4500 }],
      });
    });

    it('returns 422 OUT_OF_STOCK as a result so removedItems survives', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() => json(422, { code: 'OUT_OF_STOCK', removedItems: ['p1:0'] }));

      const result = await apiResult<{ orderId: string }, { code: string; removedItems: string[] }>(
        '/cart/checkout',
        { method: 'POST', json: {}, acceptStatuses: [409, 422] },
      );

      expect(result).toEqual({
        ok: false,
        status: 422,
        data: { code: 'OUT_OF_STOCK', removedItems: ['p1:0'] },
      });
    });

    it('returns the created order on 201', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() => json(201, { orderId: 'order_1' }));

      const result = await apiResult<{ orderId: string }>('/cart/checkout', {
        method: 'POST',
        json: {},
        acceptStatuses: [409, 422],
      });

      expect(result).toEqual({ ok: true, status: 201, data: { orderId: 'order_1' } });
    });

    it('still throws for a status that was NOT opted into', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() =>
        json(400, envelope('VALIDATION_ERROR', 'Validation failed', ['locationId: required'])),
      );

      await expect(
        apiResult('/cart/checkout', { method: 'POST', json: {}, acceptStatuses: [409, 422] }),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('documented exception #2 — GET /cart signed out', () => {
    const EMPTY = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };

    it('resolves to an empty cart without making a request', async () => {
      // Signed out the app cannot name a tenant: CartIdentityMiddleware passes
      // through, no `<slug>.fit.ge` host exists, and CartService.identity()
      // reads tenant.gymId whose getter throws — a 500 INTERNAL_ERROR, not a
      // 401. Letting that reach a screen would show "something went wrong" on a
      // cart that is simply empty, and burn the 5xx retry budget doing it.
      const mock = stubFetch(() => json(500, envelope('INTERNAL_ERROR', 'Internal server error')));

      await expect(getCartOrEmpty(EMPTY)).resolves.toEqual(EMPTY);
      expect(mock).not.toHaveBeenCalled();
    });

    it('fetches the real cart once signed in', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      const cart = { cart: { ...EMPTY, total: 4500 } };
      const mock = stubFetch(() => json(200, cart));

      await expect(getCartOrEmpty(EMPTY)).resolves.toEqual(cart);
      expect(mock).toHaveBeenCalledTimes(1);
      expect((mock.mock.calls[0] as unknown as FetchArgs)[0]).toBe(`${BASE}/cart`);
    });
  });

  describe('apiFetch', () => {
    it('returns a checked Response for the callers that need one', async () => {
      await saveTokens({ accessToken: OLD_ACCESS, refreshToken: 'r1' });
      stubFetch(() => new Response(null, { status: 204 }));
      const response = await apiFetch('/notifications/push-token/dev-1', { method: 'DELETE' });
      expect(response.status).toBe(204);
    });
  });
});
