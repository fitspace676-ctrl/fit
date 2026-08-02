import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StaffDepthService, gymLocalNow } from './staff-depth.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function make(overrides?: Record<string, unknown>) {
  return {
    findMany: vi.fn<(a: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([])),
    findFirst: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve(null)),
    findUnique: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve(null)),
    count: vi.fn<(a: AnyArgs) => Promise<number>>(() => Promise.resolve(0)),
    create: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    createMany: vi.fn<(a: AnyArgs) => Promise<{ count: number }>>((a) =>
      Promise.resolve({ count: Array.isArray(a.data) ? a.data.length : 1 }),
    ),
    update: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    updateMany: vi.fn<(a: AnyArgs) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
    delete: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve({})),
    deleteMany: vi.fn<(a: AnyArgs) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
    ...overrides,
  };
}

function setup(models?: Record<string, Record<string, unknown>>) {
  const client = {
    staffNote: make(models?.staffNote),
    staffTask: make(models?.staffTask),
    timeOffRequest: make(models?.timeOffRequest),
    shiftSlot: make(models?.shiftSlot),
    gymMember: make(models?.gymMember),
    user: make(models?.user),
  } as unknown as {
    staffNote: ReturnType<typeof make>;
    staffTask: ReturnType<typeof make>;
    timeOffRequest: ReturnType<typeof make>;
    shiftSlot: ReturnType<typeof make>;
    gymMember: ReturnType<typeof make>;
    user: ReturnType<typeof make>;
    $transaction: (cb: (tx: unknown) => unknown) => unknown;
  };
  client.$transaction = (cb: (tx: unknown) => unknown) => cb(client);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;
  return { service: new StaffDepthService(prisma, tenant), client };
}

/** Wire the requireStaff guard to resolve a staff member. */
function withStaff(models: Record<string, Record<string, unknown>> = {}) {
  return {
    gymMember: { findFirst: vi.fn(() => Promise.resolve({ id: 'gm-1' })) },
    user: { findUnique: vi.fn(() => Promise.resolve({ name: 'Alex', email: 'alex@example.com' })) },
    ...models,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('StaffDepthService.listRoles', () => {
  it('returns the four staff roles with their permissions', () => {
    const { service } = setup();
    const { roles } = service.listRoles();
    expect(roles.map((r) => r.role)).toEqual(['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER']);
    // OWNER holds staff:manage; TRAINER does not — the matrix reflects ROLE_PERMISSIONS.
    const owner = roles.find((r) => r.role === 'OWNER');
    const trainer = roles.find((r) => r.role === 'TRAINER');
    expect(owner?.permissions).toContain('staff:manage');
    expect(trainer?.permissions).not.toContain('staff:manage');
  });
});

describe('StaffDepthService staff guard', () => {
  it('404s a note list for an unknown / non-staff member', async () => {
    const { service } = setup();
    await expect(service.listNotes('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StaffDepthService.addNote', () => {
  it('snapshots the resolved author name from the session', async () => {
    const { service, client } = setup(
      withStaff({
        staffNote: {
          create: vi.fn(() =>
            Promise.resolve({
              id: 'n-1',
              staffId: 'gm-1',
              authorName: 'Alex',
              body: 'Great with new members',
              createdAt: new Date('2026-07-10T00:00:00.000Z'),
            }),
          ),
        },
      }),
    );
    const row = await service.addNote('gm-1', { body: 'Great with new members' });
    const noteData = client.staffNote.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(noteData).toMatchObject({
      gymId: 'gym-1',
      staffId: 'gm-1',
      authorId: 'u-1',
      authorName: 'Alex',
      body: 'Great with new members',
    });
    expect(row.author).toBe('Alex');
  });
});

describe('StaffDepthService.deleteNote', () => {
  it('404s when nothing is deleted', async () => {
    const { service } = setup({
      staffNote: { deleteMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    });
    await expect(service.deleteNote('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StaffDepthService.updateTask', () => {
  it('stamps completedAt when marking a task complete', async () => {
    const { service, client } = setup({
      staffTask: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: 't-1',
            staffId: 'gm-1',
            title: 'Cert',
            description: null,
            dueDate: null,
            completed: true,
            completedAt: new Date('2026-07-10T00:00:00.000Z'),
            assignedByName: 'Alex',
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
          }),
        ),
      },
    });
    await service.updateTask('t-1', { completed: true });
    const data = client.staffTask.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.completed).toBe(true);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('clears completedAt when un-completing', async () => {
    const { service, client } = setup({
      staffTask: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: 't-1',
            staffId: 'gm-1',
            title: 'Cert',
            description: null,
            dueDate: null,
            completed: false,
            completedAt: null,
            assignedByName: null,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
          }),
        ),
      },
    });
    await service.updateTask('t-1', { completed: false });
    const data = client.staffTask.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.completedAt).toBeNull();
  });
});

describe('StaffDepthService.decideTimeOff', () => {
  const decided = {
    id: 'to-1',
    staffId: 'gm-1',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-03T00:00:00.000Z'),
    reason: 'Vacation',
    status: 'approved',
    decidedByName: 'Alex',
    decidedAt: new Date('2026-07-10T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    staff: { user: { name: 'Mike', email: 'mike@example.com' } },
  };

  it('approves a pending request and snapshots the decider', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: 'to-1', status: 'pending' })
      .mockResolvedValueOnce(decided);
    const { service, client } = setup({
      timeOffRequest: { findFirst },
      user: { findUnique: vi.fn(() => Promise.resolve({ name: 'Alex', email: 'a@x.com' })) },
    });
    const row = await service.decideTimeOff('to-1', { decision: 'approve' });
    const updateArgs = client.timeOffRequest.update.mock.calls[0]![0];
    expect(updateArgs.where).toEqual({ id: 'to-1' });
    expect(updateArgs.data as Record<string, unknown>).toMatchObject({
      status: 'approved',
      decidedByName: 'Alex',
    });
    expect(row.status).toBe('approved');
    expect(row.staffName).toBe('Mike');
  });

  it('409s a request that is already decided', async () => {
    const { service } = setup({
      timeOffRequest: {
        findFirst: vi.fn(() => Promise.resolve({ id: 'to-1', status: 'approved' })),
      },
    });
    await expect(service.decideTimeOff('to-1', { decision: 'deny' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('404s an unknown request', async () => {
    const { service } = setup();
    await expect(service.decideTimeOff('nope', { decision: 'approve' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('StaffDepthService.listTimeOff', () => {
  it('applies the status + staff filters to the query', async () => {
    const { service, client } = setup();
    await service.listTimeOff({ status: 'pending', staffId: 'gm-1' });
    expect(client.timeOffRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending', staffId: 'gm-1' } }),
    );
  });

  it('omits absent filters', async () => {
    const { service, client } = setup();
    await service.listTimeOff({});
    expect(client.timeOffRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('StaffDepthService.updateSchedule', () => {
  it('replaces the schedule: clears then re-inserts in a transaction', async () => {
    const { service, client } = setup(withStaff());
    await service.updateSchedule('gm-1', {
      shifts: [
        { dayOfWeek: 0, startTime: '09:00', endTime: '17:00' },
        { dayOfWeek: 2, startTime: '10:00', endTime: '18:00', location: 'Club 1' },
      ],
    });
    expect(client.shiftSlot.deleteMany).toHaveBeenCalledWith({ where: { staffId: 'gm-1' } });
    const created = client.shiftSlot.createMany.mock.calls[0]![0].data as unknown as Array<
      Record<string, unknown>
    >;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      gymId: 'gym-1',
      staffId: 'gm-1',
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '17:00',
      location: null,
    });
  });

  it('an empty list clears the schedule without inserting', async () => {
    const { service, client } = setup(withStaff());
    await service.updateSchedule('gm-1', { shifts: [] });
    expect(client.shiftSlot.deleteMany).toHaveBeenCalledOnce();
    expect(client.shiftSlot.createMany).not.toHaveBeenCalled();
  });
});

describe('StaffDepthService.getWorkingToday', () => {
  it('queries today (0=Mon..6=Sun) and denormalises name + role, newest start first', async () => {
    // Local Wednesday → JS getDay() 3 → app weekday (3+6)%7 = 2.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
    try {
      const { service, client } = setup({
        shiftSlot: {
          findMany: vi.fn(() =>
            Promise.resolve([
              {
                staffId: 'gm-9',
                startTime: '09:00',
                endTime: '17:00',
                location: 'Branch 1',
                staff: { role: 'TRAINER', user: { name: 'Nino Trainer', email: 'nino@x.com' } },
              },
            ]),
          ),
        },
      });

      const result = await service.getWorkingToday();

      const where = client.shiftSlot.findMany.mock.calls[0]![0].where as {
        dayOfWeek: number;
        staff: { status: string };
      };
      expect(where.dayOfWeek).toBe(2);
      expect(where.staff.status).toBe('ACTIVE');
      expect(result.dayOfWeek).toBe(2);
      expect(result.shifts).toEqual([
        {
          staffId: 'gm-9',
          name: 'Nino Trainer',
          role: 'TRAINER',
          startTime: '09:00',
          endTime: '17:00',
          location: 'Branch 1',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the email when a staff member has no name', async () => {
    const { service } = setup({
      shiftSlot: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              staffId: 'gm-3',
              startTime: '08:00',
              endTime: '12:00',
              location: null,
              staff: { role: 'RECEPTIONIST', user: { name: null, email: 'front@desk.io' } },
            },
          ]),
        ),
      },
    });

    const { shifts } = await service.getWorkingToday();
    expect(shifts[0]!.name).toBe('front@desk.io');
  });
});

describe('gymLocalNow', () => {
  // 2026-07-15 is a Wednesday. Asia/Tbilisi is UTC+4 year-round.
  it("reports the gym-local weekday and time, not the server's", () => {
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T12:00:00Z'))).toEqual({
      dayOfWeek: 2,
      time: '16:00',
    });
  });

  it('rolls to the next weekday when the gym is already past midnight', () => {
    // 21:00 UTC Wednesday is 01:00 Thursday in Tbilisi.
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T21:00:00Z'))).toEqual({
      dayOfWeek: 3,
      time: '01:00',
    });
  });

  it('formats midnight as 00:00, never 24:00', () => {
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T20:00:00Z'))).toEqual({
      dayOfWeek: 3,
      time: '00:00',
    });
  });

  it('handles a zone west of UTC, where the gym is still on the previous day', () => {
    // 02:00 UTC Wednesday is 22:00 Tuesday in New York (EDT, UTC-4).
    expect(gymLocalNow('America/New_York', new Date('2026-07-15T02:00:00Z'))).toEqual({
      dayOfWeek: 1,
      time: '22:00',
    });
  });
});
