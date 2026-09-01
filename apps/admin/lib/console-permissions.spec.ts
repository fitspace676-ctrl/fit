// @fit/admin — the resolved permission set, and the branch clamp built on it.
//
// Three things have to hold or the feature is theatre:
//
//   • A gym that has configured nothing behaves EXACTLY as it did. The whole
//     migration story rests on this — no backfill, no flag, and an operator who
//     never opens the editor notices nothing.
//   • A revoked capability is actually gone, everywhere, and an unresolvable
//     session holds nothing rather than falling back to its role's defaults.
//   • A branch-scoped operator cannot reach a branch they do not hold, by cookie,
//     by URL, or by the switcher — and "all locations" is not one of their
//     answers.

import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, Permission, ROLE_PERMISSIONS } from '@fit/types';
import {
  ALL_LOCATIONS,
  NO_LOCATION,
  clampActiveLocation,
  locationFilter,
  resolveActiveLocation,
} from './active-location';
import {
  DENIED_ACCESS,
  branchAccess,
  consoleCan,
  consolePermissionsFrom,
  fullConsoleAccess,
  permittedLocations,
} from './console-permissions';
import { defaultPermissionsForRole } from './console-permissions.fixture';

const ROSTER = [
  { id: 'loc-downtown', name: 'Downtown' },
  { id: 'loc-harbour', name: 'Harbour' },
  { id: 'loc-airport', name: 'Airport' },
];

describe('a gym that has configured nothing', () => {
  it.each(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'] as const)(
    'gives %s exactly the capabilities it has always had',
    (role) => {
      const permissions = defaultPermissionsForRole(role);
      const shipped: readonly Permission[] = ROLE_PERMISSIONS[role];
      for (const permission of ALL_PERMISSIONS) {
        expect(consoleCan(permissions, permission)).toBe(shipped.includes(permission));
      }
    },
  );

  it('gives OWNER everything, over every branch', () => {
    const owner = defaultPermissionsForRole('OWNER');
    for (const permission of ALL_PERMISSIONS) {
      expect(consoleCan(owner, permission)).toBe(true);
    }
    expect(owner.branchScope).toBe('all');
  });
});

describe('fail-closed defaults', () => {
  it('holds no capability at all when the resolution failed', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(consoleCan(DENIED_ACCESS, permission)).toBe(false);
    }
  });

  it('reaches no branch, and cannot select "all", when the resolution failed', () => {
    const access = branchAccess(DENIED_ACCESS, ROSTER);
    expect(access.canSelectAll).toBe(false);
    expect(access.allowed).toEqual([]);
    expect(clampActiveLocation(ALL_LOCATIONS, access)).toBe(NO_LOCATION);
  });

  it('denies for a null/undefined set rather than throwing', () => {
    expect(consoleCan(null, Permission.MemberRead)).toBe(false);
    expect(consoleCan(undefined, Permission.MemberRead)).toBe(false);
    expect(permittedLocations(null, ROSTER)).toEqual([]);
  });

  it('gives the system roles everything without any lookup', () => {
    for (const role of ['SUPER_ADMIN', 'OWNER']) {
      const access = fullConsoleAccess(role);
      expect(access.grants).toEqual([...ALL_PERMISSIONS]);
      expect(access.branchScope).toBe('all');
    }
  });
});

describe('parsing the API answer', () => {
  const body = {
    role: 'RECEPTIONIST',
    grants: [Permission.MemberRead, Permission.ClassRead],
    branchScope: 'assigned',
    assignedLocationIds: ['loc-harbour'],
  };

  it('takes a well-formed answer at its word', () => {
    const permissions = consolePermissionsFrom(body);
    expect(permissions.role).toBe('RECEPTIONIST');
    expect(consoleCan(permissions, Permission.MemberRead)).toBe(true);
    expect(consoleCan(permissions, Permission.MemberWrite)).toBe(false);
    expect(permissions.branchScope).toBe('assigned');
    expect(permissions.assignedLocationIds).toEqual(['loc-harbour']);
  });

  it('preserves an empty grant list — "this role may do nothing" is an answer', () => {
    const permissions = consolePermissionsFrom({ ...body, grants: [] });
    expect(permissions.grants).toEqual([]);
    expect(permissions.role).toBe('RECEPTIONIST');
  });

  it('drops a capability this build has never heard of instead of denying wholesale', () => {
    // A newer API may name a permission this console does not know. Refusing the
    // whole answer for it would empty every operator's sidebar on a routine
    // deploy, and a capability we cannot name is one we cannot gate on anyway.
    const permissions = consolePermissionsFrom({
      ...body,
      grants: [Permission.MemberRead, 'telepathy:invoke'],
    });
    expect(permissions.grants).toEqual([Permission.MemberRead]);
  });

  it.each([
    ['no body', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['a missing role', { grants: [], branchScope: 'all' }],
    ['an unknown branch scope', { role: 'MANAGER', grants: [], branchScope: 'sometimes' }],
    ['grants that are not a list', { role: 'MANAGER', grants: 'all', branchScope: 'all' }],
  ])('denies for %s rather than guessing', (_label, value) => {
    expect(consolePermissionsFrom(value)).toEqual(DENIED_ACCESS);
  });
});

describe('branch scope: all', () => {
  const manager = { ...defaultPermissionsForRole('MANAGER'), assignedLocationIds: [] };

  it('offers the whole roster and the "all locations" option', () => {
    const access = branchAccess(manager, ROSTER);
    expect(access.canSelectAll).toBe(true);
    expect(permittedLocations(manager, ROSTER)).toEqual(ROSTER);
  });

  it('leaves any resolved choice alone', () => {
    const access = branchAccess(manager, ROSTER);
    expect(clampActiveLocation(ALL_LOCATIONS, access)).toBe(ALL_LOCATIONS);
    expect(clampActiveLocation('loc-airport', access)).toBe('loc-airport');
  });

  it('reaches every branch even when rostered to none of them', () => {
    // A gym-wide role is not a rostered role. An owner or manager who has never
    // been assigned to a branch still opens all of them.
    expect(branchAccess(manager, ROSTER).allowed).toEqual(ROSTER.map((l) => l.id));
  });
});

describe('branch scope: assigned', () => {
  const receptionist = defaultPermissionsForRole('RECEPTIONIST', ['loc-harbour']);

  it('defaults RECEPTIONIST and TRAINER to their assigned branches', () => {
    expect(defaultPermissionsForRole('RECEPTIONIST').branchScope).toBe('assigned');
    expect(defaultPermissionsForRole('TRAINER').branchScope).toBe('assigned');
  });

  it('shows only the branches they hold, and never "all locations"', () => {
    const access = branchAccess(receptionist, ROSTER);
    expect(access.canSelectAll).toBe(false);
    expect(permittedLocations(receptionist, ROSTER)).toEqual([
      { id: 'loc-harbour', name: 'Harbour' },
    ]);
  });

  it('cannot force another branch through ?locationId=', () => {
    // The whole point of the clamp. `resolveActiveLocation` happily accepts a
    // branch the GYM has; the second pass asks whether this PERSON has it.
    const access = branchAccess(receptionist, ROSTER);
    const asked = resolveActiveLocation('loc-airport', undefined, ROSTER);
    expect(asked).toBe('loc-airport');
    expect(clampActiveLocation(asked, access)).toBe('loc-harbour');
  });

  it('cannot force another branch through a stale cookie either', () => {
    const access = branchAccess(receptionist, ROSTER);
    const asked = resolveActiveLocation(undefined, 'loc-downtown', ROSTER);
    expect(clampActiveLocation(asked, access)).toBe('loc-harbour');
  });

  it('never resolves to "all locations", which for them would be the whole gym', () => {
    const access = branchAccess(receptionist, ROSTER);
    expect(clampActiveLocation(ALL_LOCATIONS, access)).toBe('loc-harbour');
    expect(locationFilter(clampActiveLocation(ALL_LOCATIONS, access))).toBe('loc-harbour');
  });

  it('keeps a branch they do hold', () => {
    const multi = defaultPermissionsForRole('TRAINER', ['loc-harbour', 'loc-airport']);
    const access = branchAccess(multi, ROSTER);
    expect(clampActiveLocation('loc-airport', access)).toBe('loc-airport');
  });

  it('ignores an assignment to a branch the gym no longer has', () => {
    const stale = defaultPermissionsForRole('TRAINER', ['loc-closed', 'loc-harbour']);
    expect(branchAccess(stale, ROSTER).allowed).toEqual(['loc-harbour']);
  });

  it('sees nothing when rostered nowhere — and that is not "everything"', () => {
    const unrostered = defaultPermissionsForRole('RECEPTIONIST', []);
    const access = branchAccess(unrostered, ROSTER);
    expect(permittedLocations(unrostered, ROSTER)).toEqual([]);
    expect(clampActiveLocation(ALL_LOCATIONS, access)).toBe(NO_LOCATION);
    // And that sentinel must reach the API as a filter, not as an absent one:
    // `undefined` would mean "every branch", the opposite answer.
    expect(locationFilter(NO_LOCATION)).toBe(NO_LOCATION);
  });
});
