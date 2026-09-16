// The discovery-gym decision, without a renderer.
//
// `resolveDiscoveryGym` is the whole rule as a pure function, so the branch that
// matters most — **a session costs no request** — is asserted here rather than
// only inferred from a mounted screen. The mounted half (a real `QueryClient`, a
// real `fetch`, and a retry that actually retries) is `useDiscoveryGym.test.tsx`
// on the jest-expo side of §5's boundary.
import { describe, expect, it } from 'vitest';

import { resolveDiscoveryGym, type TenantLookup } from './useDiscoveryGym';

/** A lookup that has not answered — what a disabled query also looks like. */
const IDLE: TenantLookup = { gymId: null, isPending: true, isError: false };
const RESOLVED: TenantLookup = { gymId: 'gym_slug', isPending: false, isError: false };
const FAILED: TenantLookup = { gymId: null, isPending: false, isError: true };

describe('resolveDiscoveryGym', () => {
  it('takes the session’s gym and does not wait for the lookup', () => {
    // The claim is authoritative AND terminal: even mid-flight, even failed,
    // the public lookup cannot make a signed-in screen pend or error.
    for (const lookup of [IDLE, RESOLVED, FAILED]) {
      expect(resolveDiscoveryGym('gym_session', 'downtown', lookup)).toEqual({
        gymId: 'gym_session',
        isPending: false,
        isError: false,
      });
    }
  });

  it('never lets a cached slug answer override the session’s own gym', () => {
    // The tenant-leak case. A stale build slug pointing at another gym must not
    // put that gym's id on a key minted inside this session.
    expect(resolveDiscoveryGym('gym_session', 'other-gym', RESOLVED).gymId).toBe('gym_session');
  });

  it('resolves the slug when there is no session', () => {
    expect(resolveDiscoveryGym(null, 'downtown', RESOLVED)).toEqual({
      gymId: 'gym_slug',
      isPending: false,
      isError: false,
    });
  });

  it('pends while the slug lookup is in flight', () => {
    expect(resolveDiscoveryGym(null, 'downtown', IDLE)).toEqual({
      gymId: null,
      isPending: true,
      isError: false,
    });
  });

  it('errors when the slug lookup fails', () => {
    expect(resolveDiscoveryGym(null, 'downtown', FAILED)).toEqual({
      gymId: null,
      isPending: false,
      isError: true,
    });
  });

  it('errors IMMEDIATELY with no slug — there is nothing to wait for', () => {
    // A build with no `gymSlug` and no session has nothing to look up. Pending
    // here would be a skeleton that can never resolve, which is the exact
    // failure mode this seam exists to remove.
    expect(resolveDiscoveryGym(null, null, IDLE)).toEqual({
      gymId: null,
      isPending: false,
      isError: true,
    });
  });

  it('is never pending and erroring at once', () => {
    const sessions = ['gym_session', null];
    const slugs = ['downtown', null];
    for (const session of sessions) {
      for (const slug of slugs) {
        for (const lookup of [IDLE, RESOLVED, FAILED]) {
          const state = resolveDiscoveryGym(session, slug, lookup);
          expect(state.isPending && state.isError).toBe(false);
          // And an id and an error are mutually exclusive too: a screen that
          // has a gym has nothing to retry.
          expect(state.gymId !== null && state.isError).toBe(false);
        }
      }
    }
  });
});
