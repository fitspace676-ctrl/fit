import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { clientIp } from './client-ip';

/** Build a minimal Express-request shape for the fields `clientIp` reads. */
function req(partial: { xff?: string | string[]; ip?: string; remoteAddress?: string }): Request {
  return {
    headers: partial.xff === undefined ? {} : { 'x-forwarded-for': partial.xff },
    ip: partial.ip,
    socket: { remoteAddress: partial.remoteAddress } as Request['socket'],
  } as unknown as Request;
}

describe('clientIp', () => {
  it('takes the left-most (original client) address from an X-Forwarded-For chain', () => {
    expect(clientIp(req({ xff: '9.9.9.9, 10.0.0.1, 172.16.0.1', ip: '10.0.0.1' }))).toBe('9.9.9.9');
  });

  it('handles a header parsed into an array by taking the first element, then its left-most hop', () => {
    expect(clientIp(req({ xff: ['9.9.9.9, 10.0.0.1', '172.16.0.1'] }))).toBe('9.9.9.9');
  });

  it('falls back to req.ip when no forwarded header is present', () => {
    expect(clientIp(req({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('falls back to the socket address when req.ip is also absent', () => {
    expect(clientIp(req({ remoteAddress: '198.51.100.2' }))).toBe('198.51.100.2');
  });

  it('ignores a blank forwarded value and falls through to req.ip', () => {
    expect(clientIp(req({ xff: '   ', ip: '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('degrades to a constant sentinel when nothing identifies the client', () => {
    expect(clientIp(req({}))).toBe('unknown');
  });
});
