import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as Sentry from '@sentry/nestjs';
import type { Params } from 'nestjs-pino';

/** Request augmented by pino-http (`id`) and the auth layer (`user`). */
type LoggedRequest = IncomingMessage & {
  id?: string;
  user?: { id?: string };
};

const REQUEST_ID_HEADER = 'x-request-id';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Trace id from the active Sentry span, when tracing is enabled. */
function activeTraceId(): string | undefined {
  const span = Sentry.getActiveSpan();
  return span ? span.spanContext().traceId : undefined;
}

/**
 * nestjs-pino configuration. Every request gets a stable `requestId` (honouring
 * an inbound `x-request-id`, else a fresh UUID) echoed back on the response, and
 * each log line carries `requestId`, `traceId` (Sentry), and `userId` (once the
 * auth layer populates `req.user`).
 */
export function loggerConfig(): Params {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = headerValue(req.headers[REQUEST_ID_HEADER]);
        const id = incoming ?? randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customProps: (req: IncomingMessage) => {
        const request = req as LoggedRequest;
        return {
          requestId: request.id,
          traceId: activeTraceId(),
          userId: request.user?.id,
        };
      },
      // Pretty-print in dev for readable local logs; structured JSON in prod.
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true } },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  };
}
