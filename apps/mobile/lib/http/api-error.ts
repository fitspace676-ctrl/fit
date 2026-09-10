// @fit/mobile — the one error type every API call rejects with.
//
// `apps/api`'s `AllExceptionsFilter` normalises *every* failure onto one wire
// shape:
//
//     { code, message, details, requestId?, sentryEventId? }
//
// Note what is NOT there: no `statusCode` field, and no `{ error: {...} }`
// envelope. Clients must branch on `code` — the filter's own doc comment says
// the code is "decoupled from the HTTP status so the wire contract stays stable
// even if a status is re-mapped" — and never on `message`, which is prose and is
// localised/reworded without notice.
//
// A handler may also stamp a domain-specific code onto its exception body
// (`EMAIL_TAKEN`, `PRICE_CHANGED`, `INSUFFICIENT_STOCK`, `REFRESH_TOKEN_INVALID`,
// …); those pass through the filter verbatim, so `code` is an open string, not a
// closed union.

/** The error envelope `apps/api` returns for every non-2xx response. */
export interface ApiErrorEnvelope {
  /** Machine-readable, status-independent code. Branch on this. */
  code: string;
  /** Human-readable message. Safe to show, but never branch on it. */
  message: string;
  /** Per-field validation messages, or `null` when there is no extra detail. */
  details: string[] | null;
  /** Correlates the response with server logs (`x-request-id`). */
  requestId?: string;
  /** Sentry event id — 5xx only, and only when Sentry is configured. */
  sentryEventId?: string;
}

/**
 * The status → code fallback map, transcribed from
 * `apps/api/src/common/filters/all-exceptions.filter.ts`. Used only when a
 * response carries no parseable body (a proxy 502 with an HTML page, a gateway
 * timeout) so an `ApiError` always has a usable `code`.
 */
export const STATUS_TO_CODE: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
};

/** Transport-level codes the client mints itself — no server response exists. */
export const CLIENT_ERROR_CODES = {
  /** The 15s per-attempt budget elapsed. Always paired with `status: 0`. */
  timeout: 'NETWORK_TIMEOUT',
  /** `fetch` rejected — DNS failure, no route, TLS error. `status: 0`. */
  network: 'NETWORK_ERROR',
  /** A 2xx body was not the JSON the caller asked for. */
  malformed: 'MALFORMED_RESPONSE',
} as const;

/** The server's fallback code for a status it does not map explicitly. */
export function codeForStatus(status: number): string {
  return STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
}

/** Everything an {@link ApiError} carries. */
export interface ApiErrorInit extends Partial<ApiErrorEnvelope> {
  /** HTTP status, or `0` for a transport failure that produced no response. */
  status: number;
  /** Seconds the server asked us to wait, parsed from `Retry-After` (429). */
  retryAfterSec?: number;
  /** The underlying failure, when this wraps one (a `fetch` rejection). */
  cause?: unknown;
}

/**
 * The single rejection type of every request made through `api-client`.
 *
 * D7: the client throws on any non-2xx. TanStack Query's entire error model —
 * `isError`, `error`, retry, error boundaries — is driven by a rejected promise,
 * so a client that resolves with a failed `Response` (as the deleted app's did)
 * silently disables all of it. That is how a screen calling a route which 404'd
 * on *every* invocation shipped and stayed green.
 */
export class ApiError extends Error {
  /** HTTP status, or `0` when no response was received (timeout / offline). */
  readonly status: number;
  /** The envelope's `code` — the only field callers should branch on. */
  readonly code: string;
  /** Per-field validation messages, or `null`. */
  readonly details: string[] | null;
  /** Server request id, for support tickets and log correlation. */
  readonly requestId: string | undefined;
  /** Sentry event id (5xx only). */
  readonly sentryEventId: string | undefined;
  /** Parsed `Retry-After`, in seconds. Present on a 429 that sent the header. */
  readonly retryAfterSec: number | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message ?? codeForStatus(init.status), { cause: init.cause });
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? codeForStatus(init.status);
    this.details = init.details ?? null;
    this.requestId = init.requestId;
    this.sentryEventId = init.sentryEventId;
    this.retryAfterSec = init.retryAfterSec;
    // Hermes/`@babel/plugin-transform-classes` can lose the prototype chain when
    // extending a built-in, which would make `instanceof ApiError` false.
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /** True when no response was received at all (timeout, DNS, offline). */
  get isTransport(): boolean {
    return this.status === 0;
  }

  /** True for 4xx — a class of failure that will never succeed on retry. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** Narrowing guard usable across module boundaries (survives duplicated realms). */
  static is(value: unknown): value is ApiError {
    return value instanceof ApiError || (value as ApiError | null)?.name === 'ApiError';
  }
}

/**
 * Parse a `Retry-After` header into whole seconds.
 *
 * `apps/api`'s `RateLimitGuard` sets it as delta-seconds
 * (`response.setHeader('Retry-After', resetSeconds)`), but the RFC also permits
 * an HTTP-date and an intermediary proxy may rewrite it as one, so both forms
 * are accepted. Anything unparseable — or a date already in the past — yields
 * `undefined` rather than a bogus `NaN` the caller would then wait on.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (header === null || header === undefined) {
    return undefined;
  }
  const raw = header.trim();
  if (!raw) {
    return undefined;
  }
  // A purely numeric value is delta-seconds and is resolved *here*, never by
  // `Date.parse`. That is not an optimisation: `Date.parse('-5')` succeeds — it
  // reads as the year −5 — so falling through would turn a malformed negative
  // delta into a date thirty centuries in the past, and then clamp it to "retry
  // immediately", which on a 429 is the one thing we must not do.
  if (/^[+-]?\d+$/.test(raw)) {
    const seconds = Number(raw);
    return seconds >= 0 ? seconds : undefined;
  }
  const at = Date.parse(raw);
  if (Number.isNaN(at)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Build an {@link ApiError} from a non-2xx response's status and parsed body.
 *
 * `body` is whatever `response.json()` produced — which for a proxy error page
 * or a truncated response is `undefined`, a string, or an array. Every field is
 * therefore shape-checked individually rather than the body being cast, so a
 * malformed error response degrades to a status-derived code instead of
 * producing an `ApiError` whose `code` is `undefined`.
 */
export function apiErrorFromResponse(
  status: number,
  body: unknown,
  retryAfterSec?: number,
): ApiError {
  const record = isRecord(body) ? body : {};
  return new ApiError({
    status,
    code: typeof record.code === 'string' ? record.code : codeForStatus(status),
    message: typeof record.message === 'string' ? record.message : codeForStatus(status),
    details: asStringArray(record.details),
    requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
    sentryEventId: typeof record.sentryEventId === 'string' ? record.sentryEventId : undefined,
    retryAfterSec,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  return null;
}
