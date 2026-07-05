import { describe, expect, it, vi } from 'vitest';
import type { ClassOccupancy } from '@fit/types';
import { ClassOccupancyPublisher } from './class-occupancy.publisher';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { OccupancyStreamService } from '../live/occupancy-stream.service';

const GYM_ID = 'gym-1';

/**
 * Wire the publisher over a fake tenant Prisma client (one occurrence + a waitlist
 * count) and a fake occupancy stream that records the snapshot it is handed.
 */
function setup(
  instance: {
    status: 'SCHEDULED' | 'CANCELED' | 'COMPLETED';
    bookedCount: number;
    capacityOverride: number | null;
    template: { capacity: number };
  } | null,
  waitlistCount = 0,
) {
  const findFirst = vi.fn().mockResolvedValue(instance);
  const count = vi.fn().mockResolvedValue(waitlistCount);
  const prisma = {
    client: {
      classInstance: { findFirst },
      booking: { count },
    },
  } as unknown as TenantPrismaService;
  const tenant = { gymId: GYM_ID } as unknown as TenantContext;
  const publish = vi.fn<(gymId: string, occupancy: ClassOccupancy) => void>();
  const stream = { publish } as unknown as OccupancyStreamService;
  return {
    publisher: new ClassOccupancyPublisher(prisma, tenant, stream),
    findFirst,
    count,
    publish,
  };
}

describe('ClassOccupancyPublisher', () => {
  it('broadcasts the settled occupancy tagged with the caller gym', async () => {
    const { publisher, publish } = setup(
      { status: 'SCHEDULED', bookedCount: 12, capacityOverride: null, template: { capacity: 20 } },
      3,
    );

    await publisher.publish('ci-1');

    expect(publish).toHaveBeenCalledTimes(1);
    const [gymId, occupancy] = publish.mock.calls[0]!;
    expect(gymId).toBe(GYM_ID);
    expect(occupancy).toMatchObject({
      classInstanceId: 'ci-1',
      capacity: 20,
      bookedCount: 12,
      available: 8,
      waitlistCount: 3,
      status: 'SCHEDULED',
    });
    expect(typeof occupancy.at).toBe('string');
  });

  it('resolves a per-occurrence capacity override over the template capacity', async () => {
    const { publisher, publish } = setup(
      { status: 'SCHEDULED', bookedCount: 5, capacityOverride: 8, template: { capacity: 20 } },
      0,
    );

    await publisher.publish('ci-1');

    expect(publish.mock.calls[0]![1]).toMatchObject({ capacity: 8, available: 3 });
  });

  it('clamps available to zero when a desk over-book pushes bookedCount past capacity', async () => {
    const { publisher, publish } = setup(
      { status: 'SCHEDULED', bookedCount: 22, capacityOverride: null, template: { capacity: 20 } },
      0,
    );

    await publisher.publish('ci-1');

    expect(publish.mock.calls[0]![1]).toMatchObject({
      capacity: 20,
      bookedCount: 22,
      available: 0,
    });
  });

  it('is a no-op for an unknown / cross-tenant occurrence (nothing to broadcast)', async () => {
    const { publisher, publish, count } = setup(null);

    await publisher.publish('ci-missing');

    expect(count).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('swallows a read failure so it can never disturb the write that just committed', async () => {
    const { publisher, findFirst, publish } = setup({
      status: 'SCHEDULED',
      bookedCount: 1,
      capacityOverride: null,
      template: { capacity: 10 },
    });
    findFirst.mockRejectedValueOnce(new Error('db gone'));

    await expect(publisher.publish('ci-1')).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });
});
