import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

/** Stable shape returned for every error the API surfaces. */
export interface ErrorResponseBody {
  /**
   * Machine-friendly error code clients can branch on, e.g. `VALIDATION_ERROR`,
   * `NOT_FOUND`, `INTERNAL_ERROR`. Decoupled from the HTTP status so the wire
   * contract stays stable even if a status is re-mapped.
   */
  code: string;
  /** Human-readable message safe to show a client. */
  message: string;
  /**
   * Structured detail items (e.g. per-field validation messages), or `null`
   * when the error carries no extra detail.
   */
  details: string[] | null;
  /** Correlates the response with server logs (from `x-request-id`). */
  requestId?: string;
  /**
   * Sentry event id for server (`5xx`) errors, surfaced so a user can quote it
   * in a support ticket. Absent for client (`4xx`) errors and when Sentry is
   * disabled (`SENTRY_DSN` unset).
   */
  sentryEventId?: string;
}

/** Request augmented by pino-http with a per-request `id`. */
type RequestWithId = Request & { id?: string };

/** Status at or above which an error is treated as an internal failure. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Maps known HTTP statuses to a stable, machine-friendly error `code`. Statuses
 * not listed fall back to `INTERNAL_ERROR` (>= 500) or `HTTP_ERROR` (other 4xx).
 */
const STATUS_TO_CODE: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
};

/**
 * Global exception filter.
 *
 * Catches *everything* that bubbles out of a handler and turns it into a
 * consistent {@link ErrorResponseBody} of `{ code, message, details, requestId }`.
 * Known {@link HttpException}s keep their status and message; anything else
 * becomes an opaque `500` so internal details never leak to clients. Server
 * errors (`>= 500`) are forwarded to Sentry (no-op when `SENTRY_DSN` is unset —
 * see `instrument.ts`) and the resulting event id is attached to the body so a
 * user can quote it in support; expected 4xx client errors are not captured, to
 * keep Sentry signal clean.
 *
 * Replaces `@sentry/nestjs`'s `SentryGlobalFilter`: it performs the same Sentry
 * capture while additionally normalising the response body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const { status, code, message, details } = this.describe(exception);

    let sentryEventId: string | undefined;
    if (status >= SERVER_ERROR_THRESHOLD) {
      // Unexpected — capture the original exception and keep its event id so the
      // client can quote it. `captureException` returns '' when Sentry is off.
      sentryEventId = Sentry.captureException(exception) || undefined;
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      // Expected client error — a terse warning is enough.
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${code}`);
    }

    const body: ErrorResponseBody = {
      code,
      message,
      details,
      requestId: request.id,
      ...(sentryEventId ? { sentryEventId } : {}),
    };

    response.status(status).json(body);
  }

  /** Map an arbitrary thrown value onto a status, code, message, and details. */
  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: string[] | null;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // Nest puts `{ statusCode, error, message }` here for built-in
      // exceptions, or a bare string for `new HttpException('msg', status)`.
      if (typeof payload === 'string') {
        return { status, code: this.codeFor(status), message: payload, details: null };
      }

      const record = payload as { error?: unknown; message?: unknown; code?: unknown };
      // A handler may stamp a stable, domain-specific `code` (e.g. `EMAIL_TAKEN`)
      // onto the exception body; honour it so the wire contract isn't limited to
      // the status-derived defaults. Falls back to the status mapping otherwise.
      const code = typeof record.code === 'string' ? record.code : this.codeFor(status);
      const arrayDetails = this.asStringArray(record.message);
      if (arrayDetails) {
        // class-validator surfaces one message per failed constraint.
        return { status, code, message: 'Validation failed', details: arrayDetails };
      }

      return {
        status,
        code,
        message: typeof record.message === 'string' ? record.message : exception.message,
        details: null,
      };
    }

    // Anything non-HTTP is an internal failure — never echo its details.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      details: null,
    };
  }

  private codeFor(status: number): string {
    return (
      STATUS_TO_CODE[status] ?? (status >= SERVER_ERROR_THRESHOLD ? 'INTERNAL_ERROR' : 'HTTP_ERROR')
    );
  }

  private asStringArray(value: unknown): string[] | null {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value;
    }
    return null;
  }
}
