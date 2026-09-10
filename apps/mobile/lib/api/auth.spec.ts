import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../http/api-error';
import { buildAuthUrl, createAuthApi, type AuthApi, type AuthApiDeps } from './auth';

const API_URL = 'https://api.example.test';
const TOKENS = { accessToken: 'a1', refreshToken: 'r1' };

interface Call {
  url: string;
  init: RequestInit;
}

/** An `AuthApi` over a scripted `fetch`, with every call recorded. */
function harness(
  respond: (call: number, url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return respond(calls.length, url, init);
  });
  const deps: AuthApiDeps = {
    apiUrl: API_URL,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timeoutMs: 50,
  };
  return { api: createAuthApi(deps), calls, fetchImpl };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function bodyOf(call: Call): unknown {
  return JSON.parse(call.init.body as string);
}

function only(calls: Call[]): Call {
  expect(calls).toHaveLength(1);
  return calls[0] as Call;
}

describe('createAuthApi — the wire contract', () => {
  it('POSTs login with gymSlug and no Authorization header', async () => {
    const h = harness(() => json(200, TOKENS));

    await expect(
      h.api.login({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' }),
    ).resolves.toEqual(TOKENS);

    const call = only(h.calls);
    expect(call.url).toBe(`${API_URL}/auth/login`);
    expect(call.init.method).toBe('POST');
    expect(bodyOf(call)).toEqual({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' });
    // The whole controller is @Public(); a Bearer here would be noise, and a
    // stale one would be noise the server has to parse.
    expect(call.init.headers).not.toHaveProperty('Authorization');
    // The API's session is the Bearer; the only cookie this app has is the
    // guest cart's (D3).
    expect(call.init.credentials).toBe('omit');
  });

  it('GETs verify with the token as a query parameter, not a body', async () => {
    const h = harness(() => json(200, TOKENS));
    await expect(h.api.verifyEmail('tok 1/2')).resolves.toEqual(TOKENS);

    const call = only(h.calls);
    expect(call.init.method).toBe('GET');
    expect(call.init.body).toBeUndefined();
    expect(call.url).toBe(`${API_URL}/auth/verify?token=tok+1%2F2`);
  });

  it('routes each endpoint to its documented path and body', async () => {
    const cases: { run: (api: AuthApi) => Promise<unknown>; path: string; body?: unknown }[] = [
      {
        run: (api) => api.register({ email: 'a@b.test', password: 'pw12345678', name: 'A' }),
        path: '/auth/register',
        body: { email: 'a@b.test', password: 'pw12345678', name: 'A' },
      },
      {
        // The JOIN FUNNEL's account creation, and the one `/auth/*` route that
        // both creates an account AND issues a session. `POST /checkout` runs
        // on the `TokenPair` this returns, which is why a signed-out visitor
        // can finish the funnel at all (D9).
        run: (api) =>
          api.signup({
            gymId: 'gym_1',
            name: 'ნინო ბერიძე',
            email: 'a@b.test',
            password: 'pw12345678',
            phone: '+995555000000',
          }),
        path: '/auth/signup',
        body: {
          gymId: 'gym_1',
          name: 'ნინო ბერიძე',
          email: 'a@b.test',
          password: 'pw12345678',
          phone: '+995555000000',
        },
      },
      {
        run: (api) => api.forgotPassword({ email: 'a@b.test' }),
        path: '/auth/forgot-password',
        body: { email: 'a@b.test' },
      },
      {
        run: (api) => api.resetPassword({ token: 't', password: 'pw12345678' }),
        path: '/auth/reset-password',
        body: { token: 't', password: 'pw12345678' },
      },
      // Both social routes take an **ID token**, not an authorization code —
      // the API verifies it against the provider's public keys itself.
      { run: (api) => api.google({ idToken: 'g' }), path: '/auth/google', body: { idToken: 'g' } },
      {
        run: (api) => api.apple({ idToken: 'a', name: 'Nino' }),
        path: '/auth/apple',
        body: { idToken: 'a', name: 'Nino' },
      },
      {
        run: (api) => api.logout({ refreshToken: 'r1' }),
        path: '/auth/logout',
        body: { refreshToken: 'r1' },
      },
    ];

    for (const testCase of cases) {
      const h = harness(() => json(200, { message: 'ok' }));
      await testCase.run(h.api);
      const call = only(h.calls);
      expect(call.url, testCase.path).toBe(`${API_URL}${testCase.path}`);
      expect(bodyOf(call), testCase.path).toEqual(testCase.body);
    }
  });

  it('neither social route accepts a gymSlug — social always lands on the primary gym', async () => {
    // `googleAuthSchema` / `appleAuthSchema` are `{ idToken }` / `{ idToken, name? }`,
    // and `loginWithGoogle` / `loginWithApple` call `resolveSessionScope(userId)`
    // with no slug. Asserted so nobody "fixes" a missing parameter that was never
    // in the contract.
    const h = harness(() => json(200, TOKENS));
    await h.api.google({ idToken: 'g' });
    await h.api.apple({ idToken: 'a' });
    for (const call of h.calls) {
      expect(bodyOf(call)).not.toHaveProperty('gymSlug');
    }
  });

  it('resolves a 204 logout to undefined rather than choking on an empty body', async () => {
    const h = harness(() => new Response(null, { status: 204 }));
    await expect(h.api.logout({ refreshToken: 'r1' })).resolves.toBeUndefined();
  });
});

describe('createAuthApi — failures', () => {
  it('throws ApiError carrying the envelope code and details', async () => {
    const h = harness(() =>
      json(401, {
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
        details: null,
        requestId: 'req_1',
      }),
    );

    const error = await h.api
      .login({ email: 'a@b.test', password: 'nope', gymSlug: undefined })
      .catch((caught: unknown) => caught);

    expect(ApiError.is(error)).toBe(true);
    expect(error).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      requestId: 'req_1',
    });
  });

  it('surfaces retryAfterSec on a 429 — authStrict is 5 per 900s', async () => {
    // Fifteen minutes is far past "try again later": without the number the
    // screen can only render a dead button. RateLimitGuard sets Retry-After in
    // delta-seconds on every 429.
    const h = harness(() =>
      json(
        429,
        { code: 'RATE_LIMITED', message: 'Too many requests', details: null },
        {
          'Retry-After': '840',
        },
      ),
    );

    const error = (await h.api
      .forgotPassword({ email: 'a@b.test' })
      .catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(429);
    expect(error.retryAfterSec).toBe(840);
  });

  it('reports a timeout as NETWORK_TIMEOUT with status 0', async () => {
    const h = harness(
      (_call, _url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const error = (await h.api
      .login({ email: 'a@b.test', password: 'pw', gymSlug: undefined })
      .catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_TIMEOUT');
  });

  it('reports a transport failure as NETWORK_ERROR', async () => {
    const h = harness(() => {
      throw new TypeError('Network request failed');
    });

    const error = (await h.api
      .login({ email: 'a@b.test', password: 'pw', gymSlug: undefined })
      .catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('propagates a caller cancellation verbatim instead of wrapping it', async () => {
    const controller = new AbortController();
    const h = harness(
      (_call, _url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const pending = h.api.login(
      { email: 'a@b.test', password: 'pw', gymSlug: undefined },
      { signal: controller.signal },
    );
    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);
    expect(ApiError.is(error)).toBe(false);
    expect((error as DOMException).name).toBe('AbortError');
  });

  it('throws MALFORMED_RESPONSE when a 2xx body is not JSON', async () => {
    const h = harness(() => new Response('<html>proxy</html>', { status: 200 }));
    const error = (await h.api
      .login({ email: 'a@b.test', password: 'pw', gymSlug: undefined })
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('MALFORMED_RESPONSE');
  });
});

describe('gymIdBySlug', () => {
  it('resolves the public tenant lookup to a gym id', async () => {
    const h = harness(() =>
      json(200, { gymId: 'gym_a', name: 'Downtown', timezone: 'Asia/Tbilisi' }),
    );
    await expect(h.api.gymIdBySlug('downtown')).resolves.toBe('gym_a');
    expect(only(h.calls).url).toBe(`${API_URL}/gyms/by-subdomain/downtown`);
  });

  it('resolves an unknown slug to null instead of throwing', async () => {
    // An unknown / reserved / malformed slug is the same 404, and it is a
    // diagnosis for the gym-scope check — not a failure of the sign-in that
    // already succeeded.
    const h = harness(() =>
      json(404, { code: 'GYM_NOT_FOUND', message: 'Gym not found', details: null }),
    );
    await expect(h.api.gymIdBySlug('nope')).resolves.toBeNull();
  });

  it('percent-encodes the slug into the path', async () => {
    const h = harness(() => json(404, {}));
    await h.api.gymIdBySlug('a/b');
    expect(only(h.calls).url).toBe(`${API_URL}/gyms/by-subdomain/a%2Fb`);
  });
});

describe('buildAuthUrl', () => {
  it('joins a path with or without a leading slash and appends a query', () => {
    expect(buildAuthUrl(API_URL, 'auth/login')).toBe(`${API_URL}/auth/login`);
    expect(buildAuthUrl(API_URL, '/auth/verify', { token: 'a b' })).toBe(
      `${API_URL}/auth/verify?token=a+b`,
    );
  });
});

describe('the no-recursion rule', () => {
  it('does not import the API client', () => {
    // `apiFetch` answers a 401 by refreshing and retrying. A login that 401s is
    // the *correct* answer to a wrong password, so routing these calls through
    // the client would spend the refresh token on every failed sign-in — and a
    // failing refresh would recurse. Structural, so it cannot regress.
    const source = readFileSync(fileURLToPath(new URL('./auth.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from\s+'\.\.\/http\/api-client'/);
    expect(source).not.toMatch(/from\s+'react-native/);
  });
});
