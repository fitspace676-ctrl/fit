import { describe, expect, it } from 'vitest';
import {
  assignedAtLocation,
  atLocation,
  availableAtLocation,
  memberAtLocation,
  staffAtLocation,
} from './location-filter.util';

/**
 * The branch fragments, and above all the ONE distinction between them.
 *
 * `atLocation` (Stages 0–6) and `availableAtLocation` (Stage 7) narrow the same
 * column name on different halves of the schema, and mean opposite things by a
 * NULL. Getting them the wrong way round compiles cleanly and fails silently — an
 * emptied catalogue that reads as "this branch sells nothing" — so the difference
 * is pinned here rather than left to the doc comments.
 */
describe('atLocation — "belongs to this branch"', () => {
  it('is plain equality, with no null arm', () => {
    expect(atLocation('loc-1')).toEqual({ locationId: 'loc-1' });
  });

  it('spreads to nothing without a branch, leaving the caller query plan alone', () => {
    expect(atLocation(undefined)).toEqual({});
  });

  it('EXCLUDES unattributed rows, which is the point on the money tables', () => {
    // No `OR: [{ locationId: null }, …]` anywhere in the fragment: a payment with
    // no branch is not this branch's money, and nothing knows whose it is.
    expect(Object.keys(atLocation('loc-1'))).toEqual(['locationId']);
  });
});

describe('availableAtLocation — "offered at this branch"', () => {
  it('matches the branch OR the gym-wide rows', () => {
    expect(availableAtLocation('loc-1')).toEqual({
      AND: { OR: [{ locationId: null }, { locationId: 'loc-1' }] },
    });
  });

  it('spreads to nothing without a branch', () => {
    // "All locations" is genuinely no predicate here — every catalogue row is
    // available somewhere — so the caller's query plan is untouched.
    expect(availableAtLocation(undefined)).toEqual({});
  });

  it('is NOT atLocation: the null arm is the whole difference', () => {
    const exclusive = atLocation('loc-1');
    const available = availableAtLocation('loc-1');
    expect(available).not.toEqual(exclusive);
    // A gym-wide plan (locationId NULL) is INSIDE the availability predicate and
    // outside plain equality. That one row is the difference between a narrowed
    // catalogue and an empty one.
    expect(available.AND?.OR).toContainEqual({ locationId: null });
  });

  it('nests under AND so a caller `OR` (a name search) cannot clobber it', () => {
    // Every catalogue roster sets `where.OR` for its search. Spreading a bare
    // `{ OR: [...] }` beside that would silently replace it, turning "matching the
    // search AND available here" into "available here".
    const where = {
      ...availableAtLocation('loc-1'),
      OR: [{ name: { contains: 'tee' } }, { description: { contains: 'tee' } }],
    };
    expect(where.AND).toEqual({ OR: [{ locationId: null }, { locationId: 'loc-1' }] });
    expect(where.OR).toHaveLength(2);
  });
});

describe('memberAtLocation — the PERSON hop', () => {
  it('nests the branch under `member`', () => {
    expect(memberAtLocation('loc-1')).toEqual({ member: { locationId: 'loc-1' } });
  });

  it('carries the caller conditions Prisma would not let them write twice', () => {
    expect(memberAtLocation('loc-1', { deletedAt: null })).toEqual({
      member: { deletedAt: null, locationId: 'loc-1' },
    });
  });

  it('spreads to nothing with neither a branch nor conditions', () => {
    expect(memberAtLocation(undefined)).toEqual({});
  });

  it('keeps the caller conditions when there is no branch', () => {
    expect(memberAtLocation(undefined, { deletedAt: null })).toEqual({
      member: { deletedAt: null },
    });
  });
});

describe('assignedAtLocation / staffAtLocation — the AVAILABILITY hop', () => {
  it('reads the many-to-many roster, not the base branch', () => {
    // Deliberately NOT `{ locationId }` on the member: that column partitions and
    // answers a head-count; this table overlaps and answers "who can work here".
    expect(assignedAtLocation('loc-1')).toEqual({
      locationAssignments: { some: { locationId: 'loc-1' } },
    });
  });

  it('spreads to nothing without a branch', () => {
    expect(assignedAtLocation(undefined)).toEqual({});
    expect(staffAtLocation(undefined)).toEqual({});
  });

  it('reaches the roster one relation out for Trainer / Service / TimeOffRequest', () => {
    expect(staffAtLocation('loc-1', { deletedAt: null })).toEqual({
      staff: { is: { deletedAt: null, locationAssignments: { some: { locationId: 'loc-1' } } } },
    });
  });
});
