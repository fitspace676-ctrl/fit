import { describe, expect, it, vi } from 'vitest';
import { CheckInMethod } from '@fit/db';
import type { ActivityEvent } from '@fit/types';
import { CheckInService } from './check-in.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { ActivityStreamService } from '../live/activity-stream.service';
import type { LoyaltyPointsService } from '../loyalty/loyalty-points.service';

const GYM_ID = 'gym-1';

/** A `MEMBER`-role membership as the reception lookups select it. */
function member() {
  return {
    id: 'gm-1',
    status: 'ACTIVE',
    user: { name: 'Ada Lovelace', email: 'ada@example.com' },
  };
}

/**
 * A queried check-in as every read/write selects it. `location` is nullable
 * because a retired branch leaves the arrival in place with its name gone
 * (`onDelete: SetNull`), and a test pins exactly that.
 */
interface CheckInRecordFixture {
  id: string;
  gymMemberId: string;
  method: CheckInMethod;
  checkedInAt: Date;
  member: ReturnType<typeof member>;
  location: { name: string } | null;
}

/** A created `CheckIn` row as `recordCheckIn`'s create projects it. */
function createdCheckIn(method: CheckInMethod = CheckInMethod.MANUAL): CheckInRecordFixture {
  return {
    id: 'ci-1',
    gymMemberId: 'gm-1',
    method,
    checkedInAt: new Date('2026-07-04T10:00:00.000Z'),
    member: member(),
    location: { name: 'Vake' },
  };
}

function setup() {
  const gymMember = { findFirst: vi.fn().mockResolvedValue(member()) };
  // Typed narrowly enough that the assertions can read `data.locationId` / `where`
  // off `mock.calls` without casting through `any`.
  const checkIn = {
    create: vi
      .fn<(args: { data: { locationId: string | null } }) => Promise<CheckInRecordFixture>>()
      .mockResolvedValue(createdCheckIn()),
    findMany: vi
      .fn<(args: { where: Record<string, unknown> }) => Promise<unknown[]>>()
      .mockResolvedValue([]),
  };
  // The branch lookups `resolveArrivalBranch` makes: a named branch is validated
  // through the scoped client, an unnamed one falls back to `isDefault`. Both are
  // the same `location.findFirst`, so the mock answers off the `where` it is given.
  const location = {
    findFirst: vi.fn(
      ({
        where,
      }: {
        where: { id?: string; isDefault?: boolean };
      }): Promise<{ id: string } | null> =>
        Promise.resolve(where.isDefault ? { id: 'loc-default' } : { id: where.id! }),
    ),
  };
  const subscription = {
    findFirst: vi.fn().mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
      plan: { name: 'Unlimited' },
    }),
  };
  const prisma = {
    client: { gymMember, checkIn, location, subscription },
  } as unknown as TenantPrismaService;
  const tenant = { gymId: GYM_ID } as unknown as TenantContext;
  const activityStream = {
    publish: vi.fn<(gymId: string, event: ActivityEvent) => Promise<void>>().mockResolvedValue(),
  };
  const loyalty = {
    awardForCheckIn: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const service = new CheckInService(
    prisma,
    tenant,
    activityStream as unknown as ActivityStreamService,
    loyalty as unknown as LoyaltyPointsService,
  );
  return { service, checkIn, gymMember, location, activityStream, loyalty };
}

describe('CheckInService.recordCheckIn', () => {
  it('publishes the arrival to the live activity stream, tagged with the caller gym', async () => {
    const { service, activityStream } = setup();

    await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' });

    expect(activityStream.publish).toHaveBeenCalledTimes(1);
    const [gymId, event] = activityStream.publish.mock.calls[0]!;
    expect(gymId).toBe(GYM_ID);
    expect(event).toEqual({
      id: 'checkin:ci-1',
      type: 'checkin',
      title: 'Checked in',
      detail: 'Front desk',
      memberId: 'gm-1',
      memberName: 'Ada Lovelace',
      amount: null,
      currency: null,
      at: '2026-07-04T10:00:00.000Z',
    } satisfies ActivityEvent);
  });

  it('labels the live event "QR scan" when the arrival was a QR check-in', async () => {
    const { service, checkIn, activityStream } = setup();
    checkIn.create.mockResolvedValueOnce(createdCheckIn(CheckInMethod.QR));

    await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'QR' });

    expect(activityStream.publish.mock.calls[0]![1]).toMatchObject({ detail: 'QR scan' });
  });

  it('still resolves the check-in when the live publish rejects', async () => {
    const { service, activityStream } = setup();
    activityStream.publish.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' }),
    ).resolves.toMatchObject({ checkIn: { id: 'ci-1', name: 'Ada Lovelace' } });
  });
});

describe('CheckInService.recordCheckIn — the branch walked into', () => {
  it('stamps the branch the desk named, after validating it against the tenant', async () => {
    const { service, checkIn, location } = setup();

    await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL', locationId: 'loc-vake' });

    // Validated through the SCOPED client, so another gym's branch never matches.
    expect(location.findFirst).toHaveBeenCalledWith({
      where: { id: 'loc-vake' },
      select: { id: true },
    });
    expect(checkIn.create.mock.calls[0]![0].data).toMatchObject({ locationId: 'loc-vake' });
  });

  it("falls back to the gym's default branch when the body names none", async () => {
    const { service, checkIn, location } = setup();

    await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' });

    expect(location.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true },
      select: { id: true },
    });
    // The default branch, NOT null: an unattributed arrival is the hole Stage 3
    // closes, so the write path never re-opens it.
    expect(checkIn.create.mock.calls[0]![0].data).toMatchObject({ locationId: 'loc-default' });
  });

  it("never falls back to the member's HOME branch — a visit is an event at a place", async () => {
    const { service, checkIn, gymMember } = setup();
    // A member whose home branch is Saburtalo, checking in with no branch stated.
    gymMember.findFirst.mockResolvedValueOnce({ ...member(), locationId: 'loc-saburtalo' });

    await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' });

    expect(checkIn.create.mock.calls[0]![0].data.locationId).toBe('loc-default');
    expect(checkIn.create.mock.calls[0]![0].data.locationId).not.toBe('loc-saburtalo');
  });

  it('404s an unknown or cross-tenant branch without recording the arrival', async () => {
    const { service, checkIn, location } = setup();
    location.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL', locationId: 'loc-other-gym' }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });
    expect(checkIn.create).not.toHaveBeenCalled();
  });

  it("carries the branch's name on the created row", async () => {
    const { service } = setup();

    const result = await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' });

    expect(result.checkIn.locationName).toBe('Vake');
  });

  it('renders a deleted branch as a null name rather than dropping the arrival', async () => {
    const { service, checkIn } = setup();
    // `onDelete: SetNull` — retiring a branch keeps its footfall history.
    checkIn.create.mockResolvedValueOnce({ ...createdCheckIn(), location: null });

    const result = await service.recordCheckIn({ gymMemberId: 'gm-1', method: 'MANUAL' });

    expect(result.checkIn.locationName).toBeNull();
  });
});

describe('CheckInService.listToday', () => {
  it('narrows the feed to the branch people walked into', async () => {
    const { service, checkIn } = setup();

    await service.listToday({ locationId: 'loc-vake' });

    expect(checkIn.findMany.mock.calls[0]![0].where).toMatchObject({ locationId: 'loc-vake' });
  });

  it('leaves the where untouched with no branch, so every branch shows', async () => {
    const { service, checkIn } = setup();

    await service.listToday({});

    expect(checkIn.findMany.mock.calls[0]![0].where).not.toHaveProperty('locationId');
  });

  it("projects each row's branch name for the all-branches feed", async () => {
    const { service, checkIn } = setup();
    checkIn.findMany.mockResolvedValueOnce([
      createdCheckIn(),
      { ...createdCheckIn(), id: 'ci-2', location: { name: 'Saburtalo' } },
    ]);

    const { checkIns } = await service.listToday({});

    expect(checkIns.map((row) => row.locationName)).toEqual(['Vake', 'Saburtalo']);
  });
});

describe('CheckInService.getStats', () => {
  it('narrows every figure to one branch — the badge counts that branch alone', async () => {
    const { service, checkIn } = setup();
    checkIn.findMany.mockResolvedValueOnce([
      { gymMemberId: 'gm-1', checkedInAt: new Date('2026-07-04T10:05:00.000Z') },
      { gymMemberId: 'gm-1', checkedInAt: new Date('2026-07-04T10:40:00.000Z') },
      { gymMemberId: 'gm-2', checkedInAt: new Date('2026-07-04T12:00:00.000Z') },
    ]);

    const stats = await service.getStats({ locationId: 'loc-vake' });

    expect(checkIn.findMany.mock.calls[0]![0].where).toMatchObject({ locationId: 'loc-vake' });
    // All four derive from the same filtered set: peak is the busiest hour AT the
    // branch, in-gym-now the distinct people on THAT floor.
    expect(stats).toEqual({ checkedInToday: 3, inGymNow: 2, peakToday: 2, noShowsToday: 0 });
  });

  it('stays gym-wide with no branch', async () => {
    const { service, checkIn } = setup();

    await service.getStats({});

    expect(checkIn.findMany.mock.calls[0]![0].where).not.toHaveProperty('locationId');
  });
});
