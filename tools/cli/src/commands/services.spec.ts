import { describe, expect, it } from 'vitest';
import { isHealthy, type ServicesReport } from './services';

const ok = { status: 'ok' as const, latencyMs: 1 };
const down = { status: 'error' as const, error: 'refused' };

describe('isHealthy', () => {
  it('is true only when every service reports ok', () => {
    const report: ServicesReport = { postgres: ok, redis: ok, api: ok, r2: ok };
    expect(isHealthy(report)).toBe(true);
  });

  it('is false when any service is down', () => {
    const report: ServicesReport = { postgres: ok, redis: down, api: ok, r2: ok };
    expect(isHealthy(report)).toBe(false);
  });
});
