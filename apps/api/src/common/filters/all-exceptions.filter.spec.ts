import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

// `captureException` is the only Sentry surface the filter touches. ESM module
// namespaces are not spy-able, so mock the whole module. It returns a fake
// event id so we can assert it is threaded onto 5xx response bodies.
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn(() => 'evt-abc123') }));

interface Captured {
  status: number;
  body: ErrorResponseBody;
}

/** Express `Response` stub that records the status + JSON body. */
function mockResponse(captured: Captured): unknown {
  return {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ErrorResponseBody) {
      captured.body = body;
      return this;
    },
  };
}

/** Build an `ArgumentsHost` whose HTTP context yields the given req/res. */
function mockHost(res: unknown, url = '/widgets', method = 'GET'): ArgumentsHost {
  const request = { url, method, id: 'req-123' };
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps a built-in HttpException to its status, code, message, and requestId', () => {
    const captured = {} as Captured;
    filter.catch(
      new BadRequestException('contentType is required'),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'contentType is required',
      details: null,
      requestId: 'req-123',
    });
    // 4xx client errors are not noise-shipped to Sentry, so carry no event id.
    expect(captured.body.sentryEventId).toBeUndefined();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('surfaces class-validator messages as `details` with a VALIDATION_ERROR code', () => {
    const captured = {} as Captured;
    filter.catch(
      new BadRequestException(['email must be an email', 'password is too short']),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.code).toBe('VALIDATION_ERROR');
    expect(captured.body.message).toBe('Validation failed');
    expect(captured.body.details).toEqual(['email must be an email', 'password is too short']);
  });

  it('honours a domain-specific `code` stamped on the exception payload', () => {
    const captured = {} as Captured;
    filter.catch(
      new ConflictException({ message: 'Email is already registered', code: 'EMAIL_TAKEN' }),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body.code).toBe('EMAIL_TAKEN');
    expect(captured.body.message).toBe('Email is already registered');
    expect(captured.body.details).toBeNull();
  });

  it('maps a bare-string HttpException to its status and message', () => {
    const captured = {} as Captured;
    filter.catch(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(captured.body.code).toBe('HTTP_ERROR');
    expect(captured.body.message).toBe('teapot');
    expect(captured.body.details).toBeNull();
  });

  it('turns an unknown error into an opaque 500, reports it, and attaches the event id', () => {
    const error = new Error('connection string leaked secret');
    const captured = {} as Captured;
    filter.catch(error, mockHost(mockResponse(captured)));

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
      requestId: 'req-123',
      sentryEventId: 'evt-abc123',
    });
    // The original (leaky) message must never reach the client.
    expect(captured.body.message).not.toContain('secret');
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
