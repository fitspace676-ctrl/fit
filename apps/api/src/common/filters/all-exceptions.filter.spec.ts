import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter, type ErrorResponseBody } from './all-exceptions.filter';

// `captureException` is the only Sentry surface the filter touches. ESM module
// namespaces are not spy-able, so mock the whole module to a no-op stub.
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn(() => '') }));

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

  it('preserves the status, reason, and message of a built-in HttpException', () => {
    const captured = {} as Captured;
    filter.catch(
      new BadRequestException('contentType is required'),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body).toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'contentType is required',
      path: '/widgets',
      requestId: 'req-123',
    });
    expect(typeof captured.body.timestamp).toBe('string');
    // 4xx client errors are not noise-shipped to Sentry.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('maps a bare-string HttpException to its status and message', () => {
    const captured = {} as Captured;
    filter.catch(
      new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT),
      mockHost(mockResponse(captured)),
    );

    expect(captured.status).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(captured.body.message).toBe('teapot');
  });

  it('turns an unknown error into an opaque 500 and reports it to Sentry', () => {
    const error = new Error('connection string leaked secret');
    const captured = {} as Captured;
    filter.catch(error, mockHost(mockResponse(captured)));

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    // The original (leaky) message must never reach the client.
    expect(captured.body.message).not.toContain('secret');
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
