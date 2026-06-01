import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

/** Stable shape returned for every error the API surfaces. */
export interface ErrorResponseBody {
  statusCode: number;
  /** Short, machine-friendly reason phrase (e.g. `Bad Request`). */
  error: string;
  /** Human-readable message(s) safe to show a client. */
  message: string | string[];
  /** ISO-8601 timestamp of when the error was handled. */
  timestamp: string;
  /** Request path that produced the error. */
  path: string;
  /** Correlates the response with server logs / Sentry (from `x-request-id`). */
  requestId?: string;
}

/** Request augmented by pino-http with a per-request `id`. */
type RequestWithId = Request & { id?: string };

/**
 * Global exception filter.
 *
 * Catches *everything* that bubbles out of a handler and turns it into a
 * consistent {@link ErrorResponseBody}. Known {@link HttpException}s keep their
 * status and message; anything else becomes an opaque `500` so internal details
 * never leak to clients. Server errors (`>= 500`) are forwarded to Sentry
 * (no-op when `SENTRY_DSN` is unset — see `instrument.ts`); expected 4xx
 * client errors are not, to keep Sentry signal clean.
 *
 * Replaces `@sentry/nestjs`'s `SentryGlobalFilter`: it performs the same Sentry
 * capture while additionally normalising the response body.
 */
/** Status at or above which an error is treated as an internal failure. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const { status, error, message } = this.describe(exception);

    if (status >= SERVER_ERROR_THRESHOLD) {
      // Unexpected — capture the original exception and log a full stack.
      Sentry.captureException(exception);
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      // Expected client error — a terse warning is enough.
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${error}`);
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
    };

    response.status(status).json(body);
  }

  /** Map an arbitrary thrown value onto a status, reason phrase, and message. */
  private describe(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Nest puts `{ statusCode, error, message }` here for built-in
      // exceptions, or a bare string for `new HttpException('msg', status)`.
      if (typeof payload === 'string') {
        return { status, error: exception.name, message: payload };
      }

      const record = payload as { error?: unknown; message?: unknown };
      return {
        status,
        error: typeof record.error === 'string' ? record.error : exception.name,
        message: this.normaliseMessage(record.message) ?? exception.message,
      };
    }

    // Anything non-HTTP is an internal failure — never echo its details.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    };
  }

  private normaliseMessage(value: unknown): string | string[] | undefined {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value;
    }
    return undefined;
  }
}
