import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HealthController } from './health.controller';
import type { HealthReport } from './health.service';
import { HealthService } from './health.service';

/** Minimal Express `Response` stub capturing the status code. */
function mockResponse(): Response & { statusCode: number } {
  const res = {
    statusCode: HttpStatus.OK,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number };
}

/**
 * Real {@link HealthService} (so `isHealthy` stays the production logic) with
 * `check` stubbed to a fixed report. Redis is never touched because `check` is
 * mocked, so a `null` client is safe here.
 */
function controllerWithReport(report: HealthReport): HealthController {
  const service = new HealthService(null as never);
  vi.spyOn(service, 'check').mockResolvedValue(report);
  return new HealthController(service);
}

describe('HealthController', () => {
  it('returns ok/ok and a 200 when both dependencies are up', async () => {
    const controller = controllerWithReport({ db: 'ok', redis: 'ok' });
    const res = mockResponse();

    const report = await controller.check(res);

    expect(report).toEqual({ db: 'ok', redis: 'ok' });
    expect(res.statusCode).toBe(HttpStatus.OK);
  });

  it('responds 503 when a dependency is down', async () => {
    const controller = controllerWithReport({ db: 'ok', redis: 'error' });
    const res = mockResponse();

    const report = await controller.check(res);

    expect(report).toEqual({ db: 'ok', redis: 'error' });
    expect(res.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
