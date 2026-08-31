// @fit/admin — the branch filter's resolution rules.
//
// The switcher had no coverage at all before Stage 1 (`admin-shell.test.tsx`
// mocks `TopBar` out entirely). These are the rules every console page will scope
// its fetches by, and the two that matter most are the ones a bug would hide: an
// explicit link beats the ambient cookie, and an id the gym no longer has degrades
// to "all branches" instead of showing an operator an empty table.

import { describe, expect, it } from 'vitest';
import {
  ACTIVE_LOCATION_COOKIE,
  ALL_LOCATIONS,
  locationFilter,
  resolveActiveLocation,
} from './active-location';

const LOCATIONS = [{ id: 'loc-downtown' }, { id: 'loc-harbour' }];

describe('resolveActiveLocation', () => {
  it('lets an explicit ?locationId= win over the cookie', () => {
    expect(resolveActiveLocation('loc-harbour', 'loc-downtown', LOCATIONS)).toBe('loc-harbour');
  });

  it('falls back to the cookie when the URL says nothing', () => {
    expect(resolveActiveLocation(undefined, 'loc-downtown', LOCATIONS)).toBe('loc-downtown');
  });

  it('treats an empty or whitespace param as absent, not as "all"', () => {
    // `?locationId=` is what a cleared page-local filter leaves behind; it must
    // hand back to the cookie rather than silently widening the view.
    expect(resolveActiveLocation('', 'loc-downtown', LOCATIONS)).toBe('loc-downtown');
    expect(resolveActiveLocation('   ', 'loc-downtown', LOCATIONS)).toBe('loc-downtown');
  });

  it('shows all branches when neither the URL nor the cookie says anything', () => {
    expect(resolveActiveLocation(undefined, undefined, LOCATIONS)).toBe(ALL_LOCATIONS);
    expect(resolveActiveLocation(undefined, '', LOCATIONS)).toBe(ALL_LOCATIONS);
  });

  it('degrades an unknown id to all branches rather than throwing', () => {
    // A deactivated or deleted branch must not brick a bookmark.
    expect(resolveActiveLocation('loc-closed', undefined, LOCATIONS)).toBe(ALL_LOCATIONS);
    expect(resolveActiveLocation(undefined, 'loc-closed', LOCATIONS)).toBe(ALL_LOCATIONS);
  });

  it('does not fall through to the cookie when the explicit id is unknown', () => {
    // The link asked for one specific branch. Answering with a different one is
    // worse than answering with all of them.
    expect(resolveActiveLocation('loc-closed', 'loc-downtown', LOCATIONS)).toBe(ALL_LOCATIONS);
  });

  it('accepts the "all" sentinel from either source without checking the roster', () => {
    expect(resolveActiveLocation(ALL_LOCATIONS, 'loc-downtown', LOCATIONS)).toBe(ALL_LOCATIONS);
    expect(resolveActiveLocation(undefined, ALL_LOCATIONS, LOCATIONS)).toBe(ALL_LOCATIONS);
    expect(resolveActiveLocation(ALL_LOCATIONS, undefined, [])).toBe(ALL_LOCATIONS);
  });

  it('degrades everything when the gym has no live branches', () => {
    expect(resolveActiveLocation('loc-harbour', 'loc-downtown', [])).toBe(ALL_LOCATIONS);
  });
});

describe('locationFilter', () => {
  it('sends a real branch id straight through', () => {
    expect(locationFilter('loc-harbour')).toBe('loc-harbour');
  });

  it('normalises every spelling of "all branches" to undefined', () => {
    // The UI says `'all'`, the schedule board says `''`, the API wants the key
    // absent. This function is the one place those three meet.
    expect(locationFilter(ALL_LOCATIONS)).toBeUndefined();
    expect(locationFilter('')).toBeUndefined();
    expect(locationFilter('   ')).toBeUndefined();
  });
});

describe('ACTIVE_LOCATION_COOKIE', () => {
  it('keeps the name the switcher already persisted under', () => {
    // Only the storage medium changed (localStorage → cookie); the concept, and
    // therefore the name an operator might see in devtools, did not.
    expect(ACTIVE_LOCATION_COOKIE).toBe('fit-admin-active-location');
  });
});
