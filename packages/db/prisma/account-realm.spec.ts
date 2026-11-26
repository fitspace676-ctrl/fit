import { describe, expect, it } from 'vitest';
import {
  PLATFORM_REALM,
  audienceOfRole,
  gymRealm,
  parseRealm,
  realmForRole,
} from './account-realm';

describe('account realms', () => {
  it('builds and reads back a gym realm', () => {
    expect(gymRealm('gym-1', 'staff')).toBe('gym-1:staff');
    expect(gymRealm('gym-1', 'member')).toBe('gym-1:member');
    expect(parseRealm('gym-1:staff')).toEqual({ kind: 'gym', gymId: 'gym-1', audience: 'staff' });
    expect(parseRealm('gym-1:member')).toEqual({
      kind: 'gym',
      gymId: 'gym-1',
      audience: 'member',
    });
  });

  it('reads the platform realm', () => {
    expect(parseRealm(PLATFORM_REALM)).toEqual({ kind: 'platform' });
  });

  it('rejects values it did not write', () => {
    expect(parseRealm('gym-1:owner')).toBeNull();
    expect(parseRealm('gym-1')).toBeNull();
    expect(parseRealm(':staff')).toBeNull();
    expect(() => gymRealm('', 'staff')).toThrow();
    expect(() => gymRealm('a:b', 'member')).toThrow();
  });

  it('maps MEMBER to the member set and every other gym role to staff', () => {
    expect(audienceOfRole('MEMBER')).toBe('member');
    for (const role of ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']) {
      expect(audienceOfRole(role)).toBe('staff');
    }
    expect(realmForRole('gym-1', 'TRAINER')).toBe('gym-1:staff');
    expect(() => audienceOfRole('SUPER_ADMIN')).toThrow();
  });
});
