import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth-session';
import { nextSessionState, type UseSessionResult } from './use-session';

const USER: Session = { userId: 'u1', gymId: 'g1', role: 'OWNER' };

/**
 * The sidebar vanished because a transient `GET /api/session` failure (a network blip
 * on tab refocus, a 5xx) overwrote a good session with `null`, which emptied the nav.
 * These lock the rule: only a successful response is authoritative; a failure preserves
 * the last-known session.
 */
describe('nextSessionState', () => {
  it('adopts the server answer on a successful fetch', () => {
    const prev: UseSessionResult = { user: null, isLoading: true };
    expect(nextSessionState(prev, { ok: true, user: USER })).toEqual({
      user: USER,
      isLoading: false,
    });
  });

  it('clears the session on an authoritative sign-out (ok with user: null)', () => {
    const prev: UseSessionResult = { user: USER, isLoading: false };
    expect(nextSessionState(prev, { ok: true, user: null })).toEqual({
      user: null,
      isLoading: false,
    });
  });

  it('preserves a known-good session on a transient failure (the vanishing-nav bug)', () => {
    const prev: UseSessionResult = { user: USER, isLoading: false };
    expect(nextSessionState(prev, { ok: false })).toEqual({ user: USER, isLoading: false });
  });

  it('stays loading on a transient failure when no session was resolved yet', () => {
    const prev: UseSessionResult = { user: null, isLoading: true };
    expect(nextSessionState(prev, { ok: false })).toEqual({ user: null, isLoading: true });
  });
});
