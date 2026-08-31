import { describe, expect, it } from 'vitest';
import {
  checkInRowSchema,
  checkInStatsQuerySchema,
  listTodayCheckInsQuerySchema,
  recordCheckInSchema,
  type CheckInRow,
} from './check-in';

/** A reception feed row as the API projects it. */
const row: CheckInRow = {
  id: 'ci_1',
  gymMemberId: 'gm_1',
  name: 'Ada Lovelace',
  photoUrl: null,
  method: 'MANUAL',
  locationName: 'Vake',
  checkedInAt: '2026-07-04T10:00:00.000Z',
};

describe('recordCheckInSchema', () => {
  it('defaults the method and leaves the branch absent on a bare body', () => {
    const parsed = recordCheckInSchema.parse({ gymMemberId: 'gm_1' });
    expect(parsed.method).toBe('MANUAL');
    expect(parsed.locationId).toBeUndefined();
  });

  it('carries the branch the member walked into', () => {
    expect(recordCheckInSchema.parse({ gymMemberId: 'gm_1', locationId: 'loc_1' }).locationId).toBe(
      'loc_1',
    );
  });

  // The nullability decision, pinned: OPTIONAL, not required. Making it required
  // would 400 every caller that predates the field (the console's reception POST,
  // the mobile QR flow, the e2e fixtures) the moment it ships, and a desk that
  // cannot check anybody in is worse than an under-specified arrival. The API fills
  // the gap with the gym's default branch instead of rejecting the request.
  it('accepts a body with no branch at all, so existing callers keep working', () => {
    expect(recordCheckInSchema.safeParse({ gymMemberId: 'gm_1' }).success).toBe(true);
  });

  // Optional, but never a way to SAY "no branch": an empty string is a client bug,
  // and `null` is a state the write path deliberately cannot be pushed into.
  it('rejects an empty or null branch rather than storing an unattributed arrival', () => {
    expect(recordCheckInSchema.safeParse({ gymMemberId: 'gm_1', locationId: '' }).success).toBe(
      false,
    );
    expect(recordCheckInSchema.safeParse({ gymMemberId: 'gm_1', locationId: null }).success).toBe(
      false,
    );
  });
});

describe('checkInRowSchema', () => {
  it('carries the branch the arrival happened at', () => {
    expect(checkInRowSchema.parse(row).locationName).toBe('Vake');
  });

  it('models a deleted branch as null, not an empty string', () => {
    expect(checkInRowSchema.parse({ ...row, locationName: null }).locationName).toBeNull();
    const { locationName: _omitted, ...withoutBranch } = row;
    expect(checkInRowSchema.safeParse(withoutBranch).success).toBe(false);
  });
});

describe('check-in query schemas', () => {
  it('take an optional branch, absent on "all locations"', () => {
    expect(listTodayCheckInsQuerySchema.parse({ locationId: 'loc_1' }).locationId).toBe('loc_1');
    expect(listTodayCheckInsQuerySchema.parse({}).locationId).toBeUndefined();
    expect(checkInStatsQuerySchema.parse({ locationId: 'loc_1' }).locationId).toBe('loc_1');
    expect(checkInStatsQuerySchema.parse({}).locationId).toBeUndefined();
  });

  it('reject an empty branch rather than reading it as "every branch"', () => {
    expect(listTodayCheckInsQuerySchema.safeParse({ locationId: '' }).success).toBe(false);
    expect(checkInStatsQuerySchema.safeParse({ locationId: '' }).success).toBe(false);
  });
});
