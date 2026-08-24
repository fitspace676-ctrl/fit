import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { BookingStatus, InstanceStatus } from '@fit/db';
import { MemberBookingsService } from './member-bookings.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const GYM_ID = 'gym-1';
const USER_ID = 'user-1';
const MEMBER_ID = 'gm-1';

/** A loose view of the query args the service passes — enough to assert on. */
interface QueryArgs {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

/** A joined booking row as HISTORY_SELECT projects it. */
function row(over?: {
  id?: string;
  status?: BookingStatus;
  waitlistPosition?: number | null;
  createdAt?: Date;
  startsAt?: Date;
  capacityOverride?: number | null;
  instanceStatus?: InstanceStatus;
  trainer?: { name: string } | null;
  location?: { name: string } | null;
  room?: string | null;
}) {
  return {
    id: over?.id ?? 'bk-1',
    status: over?.status ?? BookingStatus.BOOKED,
    waitlistPosition: over?.waitlistPosition ?? null,
    createdAt: over?.createdAt ?? new Date('2026-06-01T08:00:00.000Z'),
    classInstance: {
      id: 'ci-1',
      startsAt: over?.startsAt ?? new Date('2026-06-10T18:00:00.000Z'),
      endsAt: new Date('2026-06-10T19:00:00.000Z'),
      capacityOverride: over?.capacityOverride ?? null,
      bookedCount: 4,
      status: over?.instanceStatus ?? InstanceStatus.SCHEDULED,
      template: {
        title: 'Morning Yoga',
        description: 'Gentle flow',
        category: 'Yoga',
        color: '#2563eb',
        imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg',
        room: over?.room === undefined ? 'Studio A' : over.room,
        capacity: 12,
        durationMinutes: 60,
        trainer: over?.trainer === undefined ? { name: 'Nino' } : over.trainer,
        location: over?.location === undefined ? { name: 'Downtown' } : over.location,
      },
    },
  };
}

function setup(opts?: { userId?: string | null; member?: { id: string } | null }) {
  const gymMember = { findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>() };
  const booking = { findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>() };
  const client = { gymMember, booking };

  gymMember.findFirst.mockResolvedValue(
    opts?.member === undefined ? { id: MEMBER_ID } : opts.member,
  );
  booking.findMany.mockResolvedValue([]);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    gymId: GYM_ID,
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
  } as unknown as TenantContext;

  return { service: new MemberBookingsService(prisma, tenant), gymMember, booking };
}

describe('MemberBookingsService', () => {
  describe('caller membership', () => {
    it('rejects an unauthenticated caller with MEMBER_SESSION_REQUIRED', async () => {
      const { service, booking } = setup({ userId: null });
      await expect(service.list({ scope: 'all' })).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'MEMBER_SESSION_REQUIRED' },
      });
      expect(booking.findMany).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not a member of the gym with NOT_A_MEMBER', async () => {
      const { service, booking } = setup({ member: null });
      await expect(service.list({ scope: 'all' })).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: 'NOT_A_MEMBER' },
      });
      expect(booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('scope filtering & ordering', () => {
    it('upcoming filters to future occurrences ascending by start', async () => {
      const { service, booking } = setup();
      await service.list({ scope: 'upcoming' });

      const args = booking.findMany.mock.calls[0]?.[0];
      expect(args?.where).toMatchObject({ memberId: MEMBER_ID });
      const where = args?.where as { classInstance: { startsAt: { gte: Date } } };
      expect(where.classInstance.startsAt.gte).toBeInstanceOf(Date);
      expect(args?.orderBy).toEqual({ classInstance: { startsAt: 'asc' } });
    });

    it('past filters to started occurrences descending by start', async () => {
      const { service, booking } = setup();
      await service.list({ scope: 'past' });

      const args = booking.findMany.mock.calls[0]?.[0];
      const where = args?.where as { classInstance: { startsAt: { lt: Date } } };
      expect(where.classInstance.startsAt.lt).toBeInstanceOf(Date);
      expect(args?.orderBy).toEqual({ classInstance: { startsAt: 'desc' } });
    });

    it('all applies no time filter, descending by start', async () => {
      const { service, booking } = setup();
      await service.list({ scope: 'all' });

      const args = booking.findMany.mock.calls[0]?.[0];
      expect(args?.where).toEqual({ memberId: MEMBER_ID });
      expect(args?.orderBy).toEqual({ classInstance: { startsAt: 'desc' } });
    });
  });

  describe('projection', () => {
    it('flattens a joined row to the wire history entry', async () => {
      const { service, booking } = setup();
      booking.findMany.mockResolvedValue([
        row({ status: BookingStatus.WAITLIST, waitlistPosition: 2, capacityOverride: 8 }),
      ]);

      const { bookings } = await service.list({ scope: 'all' });
      expect(bookings).toEqual([
        {
          bookingId: 'bk-1',
          status: 'WAITLIST',
          waitlistPosition: 2,
          bookedAt: '2026-06-01T08:00:00.000Z',
          classInstance: {
            id: 'ci-1',
            title: 'Morning Yoga',
            description: 'Gentle flow',
            startsAt: '2026-06-10T18:00:00.000Z',
            endsAt: '2026-06-10T19:00:00.000Z',
            trainerName: 'Nino',
            locationName: 'Downtown',
            room: 'Studio A',
            // capacityOverride (8) wins over the template capacity (12).
            capacity: 8,
            bookedCount: 4,
            durationMinutes: 60,
            category: 'Yoga',
            color: '#2563eb',
            imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg',
            status: 'SCHEDULED',
          },
        },
      ]);
    });

    it('flattens a missing trainer / location / room to empty strings', async () => {
      const { service, booking } = setup();
      booking.findMany.mockResolvedValue([row({ trainer: null, location: null, room: null })]);

      const { bookings } = await service.list({ scope: 'all' });
      expect(bookings[0]?.classInstance).toMatchObject({
        trainerName: '',
        locationName: '',
        room: '',
        // Falls back to the template capacity when no override is set.
        capacity: 12,
      });
    });
  });
});
