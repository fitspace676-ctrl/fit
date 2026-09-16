// @fit/mobile — the only place in the app that calls `fetch`.
//
// Request:  attach `Authorization: Bearer <access token from the in-memory
//           snapshot>`, `Accept: application/json`, `credentials: 'omit'`, and a
//           15s abort budget composed with the caller's own signal.
// Response: 2xx → parsed body. Anything else → **throw** `ApiError`.
//           401 → one de-duplicated refresh, then one retry. Still 401 →
//           `endSession()` (keychain *and* query cache) → throw.
//
// ## The four defects this replaces
//
// 1. **The old client did not throw.** `apiFetch` handed back the raw
//    `Response`, so every hook had to write `if (!res.ok) throw` by hand — and
//    screens simply did not. That is how a shop screen calling `POST /orders`, a
//    route which does not exist, rendered a success state on a 404 for months.
//    D7: non-2xx rejects, always, with exactly two documented exceptions (see
//    {@link ApiRequestOptions.acceptStatuses} and {@link getCartOrEmpty}).
// 2. **Refresh concurrency** — delegated to `refresh-gate.ts`; read its header
//    comment for why a second concurrent refresh signs the user out.
// 3. **A dead session left the cache full.** The old handler only navigated to
//    `/login`; `endSession()` clears the cache too.
// 4. **No timeout.** A request on a dead radio hung until the OS gave up.
//
// Also fixed: the token is read from the synchronous in-memory snapshot, not
// from SecureStore (the old client did two keychain round trips per call), and
// `credentials: 'omit'` guarantees no cookie is ever attached — the server cart
// is scoped by Bearer, and `fit_cart_sid` is the *guest* path (D3).

import { env } from '../env';
import { getAccessToken, getSessionSnapshot, saveTokens, endSession } from '../auth/token-store';
import { ApiError, apiErrorFromResponse, parseRetryAfter, CLIENT_ERROR_CODES } from './api-error';
import {
  configureSharedRefreshGate,
  resetSharedRefreshGate,
  sharedRefreshGate,
  type RefreshGate,
} from './refresh-gate';

/** Options for {@link apiFetch} / {@link apiJson}. */
export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /**
   * A JSON body. Serialised here (not by the caller) so the retry after a
   * refresh can replay the *same* bytes — a `ReadableStream` body would already
   * be consumed by then, which is a silent "the retry sent an empty body" bug.
   */
  json?: unknown;
  /** Query parameters. `undefined` / `null` values are dropped, not sent as `"undefined"`. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Extra headers, merged over the defaults. */
  headers?: Record<string, string>;
  /** The caller's cancellation signal (TanStack Query passes one). */
  signal?: AbortSignal | null;
  /** Override the per-attempt timeout. */
  timeoutMs?: number;
  /**
   * Send no `Authorization` header even when a session exists. For the `@Public()`
   * auth routes, where a stale token would be pointless noise.
   */
  anonymous?: boolean;
  /**
   * Statuses to **return** instead of throwing.
   *
   * The one legitimate use is `POST /cart/checkout`, whose controller
   * (`apps/api/src/cart/cart.controller.ts`) hand-sets `409 { code:
   * 'PRICE_CHANGED', newPrices }` and `422 { code: 'OUT_OF_STOCK', removedItems }`
   * via `res.status(...)` and a normal return — precisely so the global
   * exception filter never sees them and cannot flatten `newPrices` /
   * `removedItems` away. Throwing an `ApiError` there would drop the only fields
   * the screen needs to tell the buyer what changed.
   */
  acceptStatuses?: readonly number[];
}

/** The result of a request that opted into {@link ApiRequestOptions.acceptStatuses}. */
export type ApiResult<TOk, TErr = unknown> =
  | { readonly ok: true; readonly status: number; readonly data: TOk }
  | { readonly ok: false; readonly status: number; readonly data: TErr };

// The refresh gate is shared process-wide and owned by `refresh-gate.ts` — see
// the note there for why two gates would be a silent-sign-out bug. This module
// only supplies the dependencies; whichever caller runs first configures it.
function refreshGate(): RefreshGate {
  configureSharedRefreshGate({
    apiUrl: env.apiUrl,
    // The **bare** global fetch. Passing `apiFetch` here would make a failed
    // refresh recurse into itself; `refresh-gate.ts` cannot even import this
    // module, and its spec asserts that.
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    getSnapshot: getSessionSnapshot,
    saveTokens,
    timeoutMs: env.requestTimeoutMs,
  });
  return sharedRefreshGate();
}

/** Discard the module-level gate. Specs only, so state cannot leak between cases. */
export function resetApiClientForTests(): void {
  resetSharedRefreshGate();
}

/** Build the absolute URL for an API-relative path plus optional query. */
export function buildUrl(path: string, query?: ApiRequestOptions['query']): string {
  const base = `${env.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) {
    return base;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const serialised = params.toString();
  return serialised ? `${base}${base.includes('?') ? '&' : '?'}${serialised}` : base;
}

/**
 * Compose the caller's signal with a fresh timeout.
 *
 * `AbortSignal.any` would do this in one line but is not reliably present on
 * Hermes, and `AbortSignal.timeout` gives no way to tell *its* abort apart from
 * the caller's — which is the whole point: a caller-cancelled request must
 * propagate the cancellation (so TanStack Query treats it as cancelled), while a
 * timeout must surface as `NETWORK_TIMEOUT`.
 */
function withTimeout(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forward = (): void => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', forward);
    }
  }

  return {
    signal: controller.signal,
    didTimeOut: (): boolean => timedOut,
    dispose: (): void => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forward);
    },
  };
}

/** Build the `RequestInit` for one attempt. Pure, so the retry can rebuild it. */
function buildInit(
  options: ApiRequestOptions,
  accessToken: string | null,
  signal: AbortSignal,
): RequestInit {
  const headers: Record<string, string> = {
    // The API always answers JSON; saying so keeps a proxy from negotiating an
    // HTML error page that then fails to parse.
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.json !== undefined) {
    headers['Content-Type'] ??= 'application/json';
  }
  if (accessToken !== null) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return {
    method: options.method ?? 'GET',
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    // Never attach a cookie. `CartIdentityMiddleware` scopes a signed-in cart by
    // the Bearer token; `fit_cart_sid` is the anonymous web guest's path, and
    // sending one from the app would silently merge a stranger's guest cart.
    credentials: 'omit',
    signal,
  };
}

/** Run one attempt, translating transport failures into `ApiError`. */
async function attempt(
  url: string,
  options: ApiRequestOptions,
  accessToken: string | null,
): Promise<Response> {
  const budget = withTimeout(options.signal, options.timeoutMs ?? env.requestTimeoutMs);
  try {
    return await globalThis.fetch(url, buildInit(options, accessToken, budget.signal));
  } catch (cause) {
    if (budget.didTimeOut()) {
      throw new ApiError({
        status: 0,
        code: CLIENT_ERROR_CODES.timeout,
        message: `The request timed out after ${options.timeoutMs ?? env.requestTimeoutMs}ms`,
        cause,
      });
    }
    // A caller-initiated cancellation is not an error condition — rethrow it
    // verbatim so TanStack Query recognises it as a cancellation rather than
    // rendering an error state on a screen the user has already navigated away
    // from.
    if (options.signal?.aborted) {
      throw cause;
    }
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.network,
      message: 'The network request failed',
      cause,
    });
  } finally {
    budget.dispose();
  }
}

/**
 * Make an authenticated request and return the raw `Response` — **already
 * checked**: a non-2xx has thrown by the time this resolves (unless its status
 * is in `acceptStatuses`).
 *
 * Prefer {@link apiJson}; this exists for the handful of routes that answer
 * `204 No Content` (`POST /auth/logout`, `DELETE /notifications/push-token/:id`).
 */
export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const url = buildUrl(path, options.query);
  const sentToken = options.anonymous ? null : getAccessToken();

  const first = await attempt(url, options, sentToken);
  if (first.status !== 401 || options.anonymous || sentToken === null) {
    return check(first, options);
  }

  // 401 with a token we actually sent — the access token is expired or rejected.
  const outcome = await refreshGate().refresh(sentToken);
  if (outcome.kind !== 'refreshed') {
    // `unavailable` means the refresh could not be *delivered* (offline, 5xx
    // deploy). Ending the session there would sign a user out for being in a
    // lift, so only a definitive rejection tears the session down.
    if (outcome.kind === 'rejected' || outcome.kind === 'signed-out') {
      await endSession();
    }
    return check(first, options);
  }

  const retried = await attempt(url, options, outcome.tokens.accessToken);
  if (retried.status === 401) {
    // A *fresh* access token was also rejected: the account is disabled, the
    // membership was removed, or `tokenVersion` was bumped. The session is
    // genuinely dead — clear the keychain and the cache, then throw.
    await endSession();
  }
  return check(retried, options);
}

/** Throw unless the response is 2xx or an explicitly accepted status. */
async function check(response: Response, options: ApiRequestOptions): Promise<Response> {
  if (response.ok || options.acceptStatuses?.includes(response.status)) {
    return response;
  }
  const body: unknown = await readJson(response);
  throw apiErrorFromResponse(
    response.status,
    body,
    // `apps/api`'s RateLimitGuard sets `Retry-After` in seconds on every 429.
    response.status === 429 ? parseRetryAfter(response.headers.get('Retry-After')) : undefined,
  );
}

/** Parse a JSON body, tolerating an empty or non-JSON one (returns `null`). */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/**
 * Make an authenticated request and return its parsed JSON body.
 *
 * A `204` (or any empty body) resolves to `undefined`, which is why `T` should
 * include `void` for those routes. A 2xx whose body is not JSON throws
 * `MALFORMED_RESPONSE` rather than resolving with `null` — silently handing a
 * screen `null` where it expected a list is the shape of the bug D7 is about.
 */
export async function apiJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.malformed,
      message: 'The response body was not valid JSON',
      cause,
    });
  }
}

/**
 * Make a request whose expected failures are part of its contract, returning a
 * discriminated result instead of throwing for the statuses named in
 * `acceptStatuses`. Everything else still throws.
 *
 * This is the mechanism behind documented exception #1: `POST /cart/checkout`
 * answers `409 PRICE_CHANGED` / `422 OUT_OF_STOCK` with structured bodies that
 * an `ApiError` cannot carry.
 */
export async function apiResult<TOk, TErr = unknown>(
  path: string,
  options: ApiRequestOptions & { acceptStatuses: readonly number[] },
): Promise<ApiResult<TOk, TErr>> {
  const response = await apiFetch(path, options);
  const body = (await readJson(response)) as TOk & TErr;
  return response.ok
    ? { ok: true, status: response.status, data: body as TOk }
    : { ok: false, status: response.status, data: body as TErr };
}

/**
 * Documented exception #2: `GET /cart` while signed out resolves to an empty
 * cart instead of an error.
 *
 * Signed out, the app has no way to name a tenant. `CartIdentityMiddleware`
 * passes an unauthenticated request straight through, `SubdomainTenantMiddleware`
 * finds no `<slug>.fit.ge` host (the app talks to the API by IP or apex), and
 * `CartService.identity()` then reads `tenant.gymId`, whose getter throws
 * `InternalServerErrorException('No tenant in scope for this request')` — a
 * **500 `INTERNAL_ERROR`**, not a 401. Letting that reach a screen would show
 * "something went wrong" on a cart that is simply empty because nobody is signed
 * in, and would burn the 5xx retry budget doing it.
 *
 * So the request is not made at all when there is no session: signed out, the
 * cart is unambiguously empty. `currency` is the caller's, because the gym's
 * currency is only knowable from the gym.
 */
export async function getCartOrEmpty<TCart>(
  emptyCart: TCart,
  options: ApiRequestOptions = {},
): Promise<TCart> {
  if (getAccessToken() === null) {
    return emptyCart;
  }
  return apiJson<TCart>('/cart', options);
}
