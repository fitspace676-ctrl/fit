import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { InvoiceService } from '../billing/invoice.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { PrismaService } from '../prisma/prisma.service';
import { ServiceSessionsService } from './service-sessions.service';

type Args = Record<string, unknown>;

const person = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
  user: { name: `${first} ${last}` },
});

const service = {
  name: 'Personal training - Nino Beridze',
  type: 'PERSONAL_TRAINING',
  coverUrl: null,
  durationMinutes: 60,
  priceMinor: 5000,
  currency: 'GEL',
};

const row = (over: Args = {}) => ({
  id: 'ss-1',
  serviceId: 's-1',
  staffId: 'gm-1',
  memberId: null,
  startsAt: new Date('2026-09-01T14:00:00Z'),
  endsAt: new Date('2026-09-01T15:00:00Z'),
  status: 'OPEN',
  notes: '',
  service,
  staff: person('gm-1', 'Nino', 'Beridze'),
  member: null,
  locationId: 'loc-1',
  location: { name: 'Vake' },
  invoice: null,
  ...over,
});

function setup(
  over: {
    clash?: boolean;
    slot?: Args | null;
    userId?: string | null;
    /** The branches this service's staff member is rostered at. */
    assignments?: string[];
    /** Whether a branch id the caller sent resolves to one of this gym's. */
    locationExists?: boolean;
  } = {},
) {
  const sessionCreate = vi.fn((args: Args) => Promise.resolve({ id: 'ss-1', ...args }));
  const sessionUpdateMany = vi.fn<(args: Args) => Promise<{ count: number }>>(() =>
    Promise.resolve({ count: 1 }),
  );
  const sessionUpdate = vi.fn<(args: Args) => Promise<{ id: string }>>(() =>
    Promise.resolve({ id: 'ss-1' }),
  );
  const issue = vi.fn<(tx: unknown, input: Args) => Promise<Args>>(() =>
    Promise.resolve({ id: 'inv-1', number: 'FC-2026-1', seq: 1, year: 2026 }),
  );
  const findFirst = vi.fn((args: Args) => {
    const select = args.select as Args;
    // The overlap probe selects only `id`; the reads select the full row.
    if (Object.keys(select).length === 1 && 'id' in select) {
      return Promise.resolve(over.clash ? { id: 'ss-0' } : null);
    }
    if ('status' in select && !('service' in select) && Object.keys(select).length === 1) {
      return Promise.resolve({ status: 'OPEN' });
    }
    return Promise.resolve(over.slot === null ? null : row(over.slot));
  });
  const tx = {
    serviceSession: { updateMany: sessionUpdateMany, update: sessionUpdate },
  };
  const locationFindFirst = vi.fn(() =>
    Promise.resolve(over.locationExists === false ? null : { id: 'loc-2' }),
  );
  const sessionFindMany = vi.fn((_args: Args) => Promise.resolve([row()]));
  const locationStaffFindMany = vi.fn(() =>
    Promise.resolve((over.assignments ?? []).map((locationId) => ({ locationId }))),
  );
  const client = {
    service: {
      findFirst: vi.fn(() => Promise.resolve({ id: 's-1', staffId: 'gm-1', durationMinutes: 60 })),
    },
    serviceSession: {
      findFirst,
      findMany: sessionFindMany,
      create: sessionCreate,
      update: sessionUpdate,
    },
    gymMember: { findFirst: vi.fn(() => Promise.resolve({ id: 'gm-9' })) },
    location: { findFirst: locationFindFirst },
    locationStaff: { findMany: locationStaffFindMany },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const prisma = { client } as unknown as TenantPrismaService;
  const base = { client } as unknown as PrismaService;
  const tenant = {
    gymId: 'gym-1',
    userId: over.userId === undefined ? 'u-1' : over.userId,
  } as unknown as TenantContext;
  const invoices = { issue } as unknown as InvoiceService;
  return {
    svc: new ServiceSessionsService(prisma, base, tenant, invoices),
    sessionCreate,
    sessionUpdateMany,
    sessionUpdate,
    issue,
    findFirst,
    sessionFindMany,
    locationStaffFindMany,
  };
}

describe('ServiceSessionsService.create', () => {
  afterEach(() => vi.clearAllMocks());

  it('opens a slot with endsAt from the service duration and the staff snapshotted', async () => {
    const { svc, sessionCreate } = setup();
    await svc.create({ serviceId: 's-1', startsAt: '2026-09-01T14:00:00.000Z', notes: '' });
    expect(sessionCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        gymId: 'gym-1',
        serviceId: 's-1',
        staffId: 'gm-1',
        startsAt: new Date('2026-09-01T14:00:00Z'),
        endsAt: new Date('2026-09-01T15:00:00Z'),
      },
    });
  });

  describe('the branch a slot runs at (Stage 6)', () => {
    const input = { serviceId: 's-1', startsAt: '2026-09-01T14:00:00.000Z', notes: '' };

    it("takes the branch the caller sent, after checking it is this gym's", async () => {
      const { svc, sessionCreate } = setup({ assignments: ['loc-1', 'loc-9'] });
      await svc.create({ ...input, locationId: 'loc-2' });
      expect(sessionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: 'loc-2' });
    });

    it("422s a branch that is not one of this gym's, rather than an FK 500", async () => {
      const { svc, sessionCreate } = setup({ locationExists: false });
      await expect(svc.create({ ...input, locationId: 'loc-elsewhere' })).rejects.toMatchObject({
        response: { code: 'LOCATION_INVALID' },
      });
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('infers the branch when the coach is rostered at exactly one', async () => {
      const { svc, sessionCreate } = setup({ assignments: ['loc-1'] });
      await svc.create(input);
      // Not a guess: there is exactly one possible answer. The ambiguity Stage 6
      // refused to resolve through the roster exists only for a coach who covers
      // two sites, and this is the other case.
      expect(sessionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: 'loc-1' });
    });

    it('leaves it unattributed when the coach covers two sites, or none', async () => {
      const two = setup({ assignments: ['loc-1', 'loc-2'] });
      await two.svc.create(input);
      expect(two.sessionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: null });

      const none = setup({ assignments: [] });
      await none.svc.create(input);
      expect(none.sessionCreate.mock.calls[0]?.[0]?.data).toMatchObject({ locationId: null });
    });

    it("never falls back to the gym's default branch", async () => {
      const { svc, sessionCreate, locationStaffFindMany } = setup({ assignments: [] });
      await svc.create(input);
      // Stages 2 and 3 defaulted, because a member and a check-in are FACTS that
      // happened and a lossy attribution beats none. A slot is a PLAN: defaulting
      // one books an appointment at a door nobody chose, and the utilisation
      // figures downstream would then reconcile perfectly against something that
      // never happened. Nothing here asks for `isDefault`.
      expect(locationStaffFindMany).toHaveBeenCalled();
      const created = sessionCreate.mock.calls[0]?.[0]?.data as
        | { locationId?: string | null }
        | undefined;
      expect(created?.locationId).toBeNull();
    });

    it('narrows the calendar feed on the column, beside the PT blocks', async () => {
      const { svc, sessionFindMany } = setup();
      await svc.list({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-08T00:00:00.000Z',
        locationId: 'loc-1',
      });
      // The PT calendar draws `ServiceSession` and `PtSession` blocks side by side,
      // so the two narrow the same way. Give one a filter and not the other and a
      // branch-filtered calendar is assembled from two populations.
      expect((sessionFindMany.mock.calls[0]?.[0] as Args)?.where).toMatchObject({
        locationId: 'loc-1',
      });
    });
  });

  it("refuses a slot overlapping the staff member's other session", async () => {
    const { svc, sessionCreate } = setup({ clash: true });
    await expect(
      svc.create({ serviceId: 's-1', startsAt: '2026-09-01T14:30:00.000Z', notes: '' }),
    ).rejects.toMatchObject({ response: { code: 'STAFF_BUSY' } });
    expect(sessionCreate).not.toHaveBeenCalled();
  });
});

describe('ServiceSessionsService.book', () => {
  afterEach(() => vi.clearAllMocks());

  it('claims the slot for the member and raises a PENDING invoice for the service price', async () => {
    const { svc, sessionUpdateMany, issue, sessionUpdate } = setup({
      slot: { startsAt: new Date(Date.now() + 86_400_000) },
    });
    await svc.book('ss-1');
    expect(sessionUpdateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'ss-1', status: 'OPEN' },
      data: { status: 'BOOKED', memberId: 'gm-9' },
    });
    expect(issue.mock.calls[0]?.[1]).toMatchObject({
      gymId: 'gym-1',
      memberId: 'gm-9',
      amount: 5000,
      currency: 'GEL',
      status: 'PENDING',
      type: 'PERSONAL_TRAINING',
    });
    expect(sessionUpdate.mock.calls[0]?.[0]).toMatchObject({ data: { invoiceId: 'inv-1' } });
  });

  it('is a 409 SESSION_TAKEN when another member won the race', async () => {
    const { svc, sessionUpdateMany, issue } = setup({
      slot: { startsAt: new Date(Date.now() + 86_400_000) },
    });
    sessionUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.book('ss-1')).rejects.toBeInstanceOf(ConflictException);
    expect(issue).not.toHaveBeenCalled();
  });

  it('refuses a slot that is no longer open', async () => {
    const { svc } = setup({
      slot: { status: 'BOOKED', startsAt: new Date(Date.now() + 86_400_000) },
    });
    await expect(svc.book('ss-1')).rejects.toMatchObject({ response: { code: 'SESSION_TAKEN' } });
  });

  it('requires a member session', async () => {
    const { svc } = setup({ userId: null });
    await expect(svc.book('ss-1')).rejects.toMatchObject({
      response: { code: 'MEMBER_SESSION_REQUIRED' },
    });
  });
});
