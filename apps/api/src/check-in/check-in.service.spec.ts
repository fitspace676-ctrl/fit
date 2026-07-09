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

/** A created `CheckIn` row as `recordCheckIn`'s create projects it. */
function createdCheckIn(method: CheckInMethod = CheckInMethod.MANUAL) {
  return {
    id: 'ci-1',
    gymMemberId: 'gm-1',
    method,
    checkedInAt: new Date('2026-07-04T10:00:00.000Z'),
    member: member(),
  };
}

function setup() {
  const gymMember = { findFirst: vi.fn().mockResolvedValue(member()) };
  const checkIn = { create: vi.fn().mockResolvedValue(createdCheckIn()) };
  const subscription = {
    findFirst: vi.fn().mockResolvedValue({
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
      plan: { name: 'Unlimited' },
    }),
  };
  const prisma = {
    client: { gymMember, checkIn, subscription },
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
  return { service, checkIn, activityStream, loyalty };
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
