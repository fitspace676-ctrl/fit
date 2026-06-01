import { describe, expect, it } from 'vitest';
import { hostPortFromUrl } from './net';

describe('hostPortFromUrl', () => {
  it('extracts host/port from a postgres URL', () => {
    expect(hostPortFromUrl('postgresql://user:pass@db.example.com:5433/fit')).toEqual({
      host: 'db.example.com',
      port: 5433,
    });
  });

  it('falls back to the protocol default port', () => {
    expect(hostPortFromUrl('redis://localhost')).toEqual({ host: 'localhost', port: 6379 });
    expect(hostPortFromUrl('postgres://localhost/fit')).toEqual({ host: 'localhost', port: 5432 });
    expect(hostPortFromUrl('https://api.example.com')).toEqual({
      host: 'api.example.com',
      port: 443,
    });
  });

  it('returns undefined for unparseable input', () => {
    expect(hostPortFromUrl('not a url')).toBeUndefined();
  });
});
