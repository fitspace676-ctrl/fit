import { describe, expect, it, vi } from 'vitest';
import type { Session } from './auth-session';
import { renewSession } from './session-renewal';

const USER: Session = { userId: 'u1', gymId: 'g1', role: 'OWNER' };
const PAIR = { accessToken: 'access.2', refreshToken: 'refresh.2' };

describe('renewSession', () => {
  it('answers a live access token as it is, without touching the refresh token', async () => {
    const refresh = vi.fn();
    const result = await renewSession({
      current: USER,
      refreshToken: 'refresh.1',
      refresh,
      verify: vi.fn(),
    });
    expect(result).toEqual({ user: USER, recoverable: false, refreshed: null });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renews an expired session in place, so the browser never has to reload', async () => {
    const result = await renewSession({
      current: null,
      refreshToken: 'refresh.1',
      refresh: vi.fn(() => Promise.resolve(PAIR)),
      verify: vi.fn(() => Promise.resolve(USER)),
    });
    expect(result).toEqual({ user: USER, recoverable: false, refreshed: PAIR });
  });

  it('keeps a failed renewal recoverable: a lost race is not a sign-out', async () => {
    const result = await renewSession({
      current: null,
      refreshToken: 'refresh.1',
      refresh: vi.fn(() => Promise.resolve(null)),
      verify: vi.fn(),
    });
    expect(result).toEqual({ user: null, recoverable: true, refreshed: null });
  });

  it('reports a real sign-out when there is no refresh token at all', async () => {
    const result = await renewSession({
      current: null,
      refreshToken: null,
      refresh: vi.fn(),
      verify: vi.fn(),
    });
    expect(result).toEqual({ user: null, recoverable: false, refreshed: null });
  });
});
