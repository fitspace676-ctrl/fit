import { describe, expect, it } from 'vitest';
import {
  ApiError,
  apiErrorFromResponse,
  codeForStatus,
  parseRetryAfter,
  STATUS_TO_CODE,
} from './api-error';

describe('codeForStatus', () => {
  it('mirrors the API filter STATUS_TO_CODE map', () => {
    // Transcribed from apps/api/src/common/filters/all-exceptions.filter.ts.
    expect(STATUS_TO_CODE).toEqual({
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMITED',
    });
  });

  it('falls back the way the filter does for unmapped statuses', () => {
    expect(codeForStatus(418)).toBe('HTTP_ERROR');
    expect(codeForStatus(500)).toBe('INTERNAL_ERROR');
    expect(codeForStatus(503)).toBe('INTERNAL_ERROR');
  });
});

describe('apiErrorFromResponse', () => {
  it('carries the API envelope verbatim', () => {
    const error = apiErrorFromResponse(409, {
      code: 'EMAIL_TAKEN',
      message: 'That address already has an account',
      details: ['email: taken'],
      requestId: 'req-1',
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('EMAIL_TAKEN');
    expect(error.message).toBe('That address already has an account');
    expect(error.details).toEqual(['email: taken']);
    expect(error.requestId).toBe('req-1');
  });

  it('keeps a domain code the handler stamped, not the status default', () => {
    // The filter honours a handler's own `code`, so a 409 is not always CONFLICT.
    expect(apiErrorFromResponse(409, { code: 'PRICE_CHANGED', message: 'x' }).code).toBe(
      'PRICE_CHANGED',
    );
  });

  it('surfaces sentryEventId on a 5xx so a user can quote it', () => {
    const error = apiErrorFromResponse(500, {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
      sentryEventId: 'abc123',
    });
    expect(error.sentryEventId).toBe('abc123');
  });

  it('degrades to a status-derived code when the body is not the envelope', () => {
    // A proxy 502 with an HTML page, or a truncated response.
    for (const body of [null, undefined, '<html>', 42, ['a'], {}]) {
      const error = apiErrorFromResponse(502, body);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.details).toBeNull();
    }
  });

  it('ignores a details field that is not an array of strings', () => {
    expect(
      apiErrorFromResponse(400, { code: 'X', message: 'y', details: [1, 2] }).details,
    ).toBeNull();
    expect(
      apiErrorFromResponse(400, { code: 'X', message: 'y', details: 'nope' }).details,
    ).toBeNull();
  });
});

describe('ApiError', () => {
  it('survives the built-in-subclass prototype trap', () => {
    const error = new ApiError({ status: 404 });
    expect(error instanceof ApiError).toBe(true);
    expect(error instanceof Error).toBe(true);
    expect(ApiError.is(error)).toBe(true);
    expect(ApiError.is(new Error('plain'))).toBe(false);
    expect(ApiError.is(null)).toBe(false);
    expect(ApiError.is(undefined)).toBe(false);
  });

  it('classifies transport failures and client errors', () => {
    expect(new ApiError({ status: 0, code: 'NETWORK_TIMEOUT' }).isTransport).toBe(true);
    expect(new ApiError({ status: 403 }).isClientError).toBe(true);
    expect(new ApiError({ status: 500 }).isClientError).toBe(false);
    expect(new ApiError({ status: 0 }).isClientError).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('parses the delta-seconds form the API sends', () => {
    // apps/api RateLimitGuard: response.setHeader('Retry-After', resetSeconds)
    expect(parseRetryAfter('12')).toBe(12);
    expect(parseRetryAfter(' 60 ')).toBe(60);
    expect(parseRetryAfter('0')).toBe(0);
  });

  it('parses the HTTP-date form a proxy may rewrite it to', () => {
    const now = Date.parse('2026-08-30T12:00:00Z');
    expect(parseRetryAfter('Sun, 30 Aug 2026 12:00:30 GMT', now)).toBe(30);
  });

  it('clamps a date already in the past to zero', () => {
    const now = Date.parse('2026-08-30T12:00:00Z');
    expect(parseRetryAfter('Sun, 30 Aug 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('returns undefined rather than NaN for a missing or junk header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});
