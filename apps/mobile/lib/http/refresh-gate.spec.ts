import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { createRefreshGate, type RefreshGateDeps } from './refresh-gate';
import type { TokenPair } from '../auth/token-store';

const API_URL = 'https://api.example.test';

/** A gate over a mutable in-memory session, with a scripted `fetch`. */
function harness(options: {
  initial?: TokenPair | null;
  respond: (call: number, init: RequestInit) => Promise<Response> | Response;
}) {
  let session: TokenPair | null =
    options.initial === undefined ? { accessToken: 'old', refreshToken: 'r1' } : options.initial;
  let calls = 0;

  const fetchImpl = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
    calls += 1;
    return options.respond(calls, init);
  });

  const deps: RefreshGateDeps = {
    apiUrl: API_URL,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getSnapshot: () => session,
    saveTokens: (tokens) => {
      session = tokens;
      return Promise.resolve();
    },
    timeoutMs: 50,
  };

  return {
    gate: createRefreshGate(deps),
    fetchImpl,
    setSession: (next: TokenPair | null) => {
      session = next;
    },
    getSession: () => session,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FRESH: TokenPair = { accessToken: 'new', refreshToken: 'r2' };

describe('createRefreshGate', () => {
  it('spends the refresh token against POST /auth/refresh and persists the rotation', async () => {
    const h = harness({ respond: () => jsonResponse(200, FRESH) });

    await expect(h.gate.refresh('old')).resolves.toEqual({ kind: 'refreshed', tokens: FRESH });

    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_URL}/auth/refresh`);
    expect(init.method).toBe('POST');
    // refreshSchema (packages/types/src/auth.ts) is exactly `{ refreshToken }`.
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'r1' });
    // The session is the Bearer token; a cookie here would only be the guest cart's.
    expect(init.credentials).toBe('omit');
    expect(h.getSession()).toEqual(FRESH);
  });

  it('collapses N concurrent callers into exactly ONE refresh', async () => {
    // rotateRefreshToken revokes the token it consumes; a second concurrent
    // spend loses the `updateMany({ revokedAt: null })` race, is classified as
    // reuse, and revokes the WHOLE FAMILY — silently signing the user out of a
    // healthy session. See token.service.ts.
    const h = harness({ respond: () => jsonResponse(200, FRESH) });

    const results = await Promise.all([
      h.gate.refresh('old'),
      h.gate.refresh('old'),
      h.gate.refresh('old'),
      h.gate.refresh('old'),
      h.gate.refresh('old'),
    ]);

    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ kind: 'refreshed', tokens: FRESH });
    }
  });

  it('makes NO request when the stale token was already superseded', async () => {
    // The gap the deleted app's singleton left: a caller that 401s a few
    // milliseconds *after* a refresh completed found `refreshInFlight` back at
    // null and spent the freshly-minted token a second time.
    const h = harness({ initial: FRESH, respond: () => jsonResponse(200, FRESH) });

    await expect(h.gate.refresh('old')).resolves.toEqual({ kind: 'refreshed', tokens: FRESH });
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes again once the new token has itself expired', async () => {
    const second: TokenPair = { accessToken: 'newer', refreshToken: 'r3' };
    let body = FRESH;
    const h = harness({
      respond: () => jsonResponse(200, body),
    });

    await h.gate.refresh('old');
    body = second;
    await expect(h.gate.refresh('new')).resolves.toEqual({ kind: 'refreshed', tokens: second });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports signed-out when there is no refresh token to spend', async () => {
    const h = harness({ initial: null, respond: () => jsonResponse(200, FRESH) });
    await expect(h.gate.refresh(null)).resolves.toEqual({ kind: 'signed-out' });
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('reports rejected on a 401 — the family is gone', async () => {
    const h = harness({
      respond: () =>
        jsonResponse(401, {
          code: 'REFRESH_TOKEN_INVALID',
          message: 'Refresh token is invalid or has expired',
          details: null,
        }),
    });

    const outcome = await h.gate.refresh('old');
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') {
      expect(outcome.error).toBeInstanceOf(ApiError);
      expect(outcome.error.code).toBe('REFRESH_TOKEN_INVALID');
      expect(outcome.error.status).toBe(401);
    }
  });

  it('reports unavailable (not rejected) on a 5xx — a deploy is not a dead session', async () => {
    const h = harness({ respond: () => jsonResponse(503, { code: 'INTERNAL_ERROR' }) });
    const outcome = await h.gate.refresh('old');
    expect(outcome.kind).toBe('unavailable');
  });

  it('reports unavailable when the request cannot be delivered', async () => {
    const h = harness({
      respond: () => Promise.reject(new TypeError('Network request failed')),
    });
    const outcome = await h.gate.refresh('old');
    expect(outcome.kind).toBe('unavailable');
    if (outcome.kind === 'unavailable') {
      expect(outcome.error.code).toBe('NETWORK_ERROR');
      expect(outcome.error.status).toBe(0);
    }
  });

  it('reports unavailable when the 200 body is not a token pair', async () => {
    for (const body of [{}, { accessToken: 'a' }, { accessToken: '', refreshToken: 'b' }, null]) {
      const h = harness({ respond: () => jsonResponse(200, body) });
      const outcome = await h.gate.refresh('old');
      expect(outcome.kind).toBe('unavailable');
      if (outcome.kind === 'unavailable') {
        expect(outcome.error.code).toBe('MALFORMED_RESPONSE');
      }
      // A junk response must never be persisted as a session.
      expect(h.getSession()).toEqual({ accessToken: 'old', refreshToken: 'r1' });
    }
  });

  it('times out rather than hanging on a dead radio', async () => {
    const h = harness({
      // A real `fetch` rejects with an AbortError when its signal fires; a fake
      // that ignored the signal would hang this test forever instead of failing.
      respond: (_call, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    });
    const outcome = await h.gate.refresh('old');
    expect(outcome.kind).toBe('unavailable');
    if (outcome.kind === 'unavailable') {
      expect(outcome.error.code).toBe('NETWORK_TIMEOUT');
    }
  });

  it('releases the gate after a failure so a later attempt can retry', async () => {
    let fail = true;
    const h = harness({
      respond: () => (fail ? jsonResponse(503, {}) : jsonResponse(200, FRESH)),
    });

    expect(h.gate.isRefreshing()).toBe(false);
    await h.gate.refresh('old');
    expect(h.gate.isRefreshing()).toBe(false);

    fail = false;
    await expect(h.gate.refresh('old')).resolves.toEqual({ kind: 'refreshed', tokens: FRESH });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('never imports the API client — a refresh through apiFetch is infinite recursion', () => {
    // Structural, not behavioural: the gate takes its `fetch` as a dependency,
    // so it *cannot* reach apiFetch. This asserts nobody re-introduces the
    // import later, which is the only way the recursion could come back.
    const source = readFileSync(
      fileURLToPath(new URL('./refresh-gate.ts', import.meta.url)),
      'utf8',
    );
    const imports = [...source.matchAll(/^\s*import[\s\S]*?from\s+'([^']+)';/gm)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(['./api-error', '../auth/token-store']);
    expect(source).not.toMatch(/from\s+'[^']*api-client'/);
    expect(source).not.toMatch(/import\s*\(\s*['"][^'"]*api-client/);
  });
});
