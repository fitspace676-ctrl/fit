import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma, ServiceSessionStatus, ServiceStatus } from '@fit/db';
import type {
  AdminServiceSession,
  AdminServiceSessionsResponse,
  BookServiceSessionResult,
  CreateServiceSessionData,
  ListAdminServiceSessionsQuery,
  ListMemberServiceSessionsResponse,
  ListServiceSlotsQuery,
  ListServiceSlotsResponse,
  MemberServiceSession,
  ServiceSlot,
} from '@fit/types';
import { InvoiceService } from '../billing/invoice.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';

/** A staff / member row as the session names it. */
const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  user: { select: { name: true } },
} satisfies Prisma.GymMemberSelect;

const SESSION_SELECT = {
  id: true,
  serviceId: true,
  staffId: true,
  memberId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  service: {
    select: {
      name: true,
      type: true,
      coverUrl: true,
      durationMinutes: true,
      priceMinor: true,
      currency: true,
    },
  },
  staff: { select: PERSON_SELECT },
  member: { select: PERSON_SELECT },
  invoice: { select: { id: true, number: true, amount: true, currency: true, status: true } },
} satisfies Prisma.ServiceSessionSelect;

type SessionRecord = Prisma.ServiceSessionGetPayload<{ select: typeof SESSION_SELECT }>;
type PersonRecord = Prisma.GymMemberGetPayload<{ select: typeof PERSON_SELECT }>;

/** The statuses that hold a staff member's time — an overlap with these is a clash. */
const BUSY: ServiceSessionStatus[] = [ServiceSessionStatus.OPEN, ServiceSessionStatus.BOOKED];

/**
 * Service sessions — the bookable slots of a service. Three surfaces share it:
 * staff open, cancel and complete slots on the PT calendar (tenant-scoped
 * client); the portal lists OPEN slots without a session (base client, explicit
 * `gymId`); a member books a slot, which raises a PENDING invoice for the
 * service price inside the same transaction that claims the slot.
 */
@Injectable()
export class ServiceSessionsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly base: PrismaService,
    private readonly tenant: TenantContext,
    private readonly invoices: InvoiceService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────

  async list(query: ListAdminServiceSessionsQuery): Promise<AdminServiceSessionsResponse> {
    const rows = await this.prisma.client.serviceSession.findMany({
      where: {
        ...(query.staffId ? { staffId: query.staffId } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        startsAt: { gte: new Date(query.from), lt: new Date(query.to) },
      },
      select: SESSION_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return { sessions: rows.map(toAdmin) };
  }

  /**
   * Open one slot. `endsAt` follows the service's duration and `staffId` is
   * snapshotted from the service. The staff member must be free: any OPEN or
   * BOOKED session of theirs overlapping the new one is a `409 STAFF_BUSY`.
   */
  async create(data: CreateServiceSessionData): Promise<AdminServiceSession> {
    const service = await this.prisma.client.service.findFirst({
      where: { id: data.serviceId, status: ServiceStatus.ACTIVE },
      select: { id: true, staffId: true, durationMinutes: true },
    });
    if (!service) {
      throw new NotFoundException({ message: 'Service not found', code: 'SERVICE_NOT_FOUND' });
    }
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60 * 1000);

    const clash = await this.prisma.client.serviceSession.findFirst({
      where: {
        staffId: service.staffId,
        status: { in: BUSY },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        message: 'The staff member already has a session at that time',
        code: 'STAFF_BUSY',
      });
    }

    const created = await this.prisma.client.serviceSession.create({
      data: {
        gymId: this.tenant.gymId,
        serviceId: service.id,
        staffId: service.staffId,
        startsAt,
        endsAt,
        notes: data.notes,
      },
      select: { id: true },
    });
    return this.getAdmin(created.id);
  }

  async cancel(id: string): Promise<AdminServiceSession> {
    return this.transition(id, BUSY, ServiceSessionStatus.CANCELLED);
  }

  async complete(id: string): Promise<AdminServiceSession> {
    return this.transition(id, [ServiceSessionStatus.BOOKED], ServiceSessionStatus.COMPLETED);
  }

  private async transition(
    id: string,
    from: ServiceSessionStatus[],
    to: ServiceSessionStatus,
  ): Promise<AdminServiceSession> {
    const existing = await this.prisma.client.serviceSession.findFirst({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw this.notFound();
    if (!from.includes(existing.status)) {
      throw new ConflictException({
        message: `A ${existing.status.toLowerCase()} session cannot be marked ${to.toLowerCase()}`,
        code: 'SESSION_STATUS_INVALID',
      });
    }
    await this.prisma.client.serviceSession.update({
      where: { id },
      data: { status: to },
      select: { id: true },
    });
    return this.getAdmin(id);
  }

  private async getAdmin(id: string): Promise<AdminServiceSession> {
    const row = await this.prisma.client.serviceSession.findFirst({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!row) throw this.notFound();
    return toAdmin(row);
  }

  // ── Public (portal) ──────────────────────────────────────────────────────

  /** The OPEN, still-future slots of a gym (optionally one service) in `[from, to)`. */
  async listOpenSlots(query: ListServiceSlotsQuery): Promise<ListServiceSlotsResponse> {
    const from = new Date(Math.max(new Date(query.from).getTime(), Date.now()));
    const rows = await this.base.client.serviceSession.findMany({
      where: {
        gymId: query.gymId,
        status: ServiceSessionStatus.OPEN,
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        service: { status: ServiceStatus.ACTIVE },
        startsAt: { gte: from, lt: new Date(query.to) },
      },
      select: SESSION_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return { slots: rows.map(toSlot) };
  }

  // ── Member ───────────────────────────────────────────────────────────────

  async listMine(): Promise<ListMemberServiceSessionsResponse> {
    const memberId = await this.requireCallerMembership();
    const rows = await this.prisma.client.serviceSession.findMany({
      where: { memberId },
      select: SESSION_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return { sessions: rows.map(toMember) };
  }

  /**
   * Book an OPEN slot for the calling member and raise the invoice for it, in
   * one transaction. The claim is a conditional `updateMany` (`status = OPEN`),
   * so two members racing for the same slot cannot both win: the loser's update
   * touches 0 rows and is a `409 SESSION_TAKEN`. The invoice is PENDING — the
   * member pays at the front desk (or online later); its `dueDate` is the
   * session itself.
   */
  async book(id: string): Promise<BookServiceSessionResult> {
    const memberId = await this.requireCallerMembership();
    const gymId = this.tenant.gymId;

    const slot = await this.prisma.client.serviceSession.findFirst({
      where: { id },
      select: {
        startsAt: true,
        status: true,
        service: { select: { name: true, type: true, priceMinor: true, currency: true } },
      },
    });
    if (!slot) throw this.notFound();
    if (slot.status !== ServiceSessionStatus.OPEN) {
      throw new ConflictException({
        message: 'That slot is no longer open',
        code: 'SESSION_TAKEN',
      });
    }
    if (slot.startsAt.getTime() <= Date.now()) {
      throw new ConflictException({
        message: 'That slot has already started',
        code: 'SESSION_PAST',
      });
    }

    await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.serviceSession.updateMany({
        where: { id, status: ServiceSessionStatus.OPEN },
        data: { status: ServiceSessionStatus.BOOKED, memberId },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          message: 'That slot is no longer open',
          code: 'SESSION_TAKEN',
        });
      }
      const issued = await this.invoices.issue(tx, {
        gymId,
        memberId,
        amount: slot.service.priceMinor,
        currency: slot.service.currency,
        status: InvoiceStatus.PENDING,
        type:
          slot.service.type === 'PERSONAL_TRAINING'
            ? InvoiceType.PERSONAL_TRAINING
            : InvoiceType.SERVICE,
        description: `${slot.service.name} - ${slot.startsAt.toISOString().slice(0, 10)}`,
        dueDate: slot.startsAt,
      });
      await tx.serviceSession.update({
        where: { id },
        data: { invoiceId: issued.id },
        select: { id: true },
      });
    });

    const row = await this.prisma.client.serviceSession.findFirst({
      where: { id },
      select: SESSION_SELECT,
    });
    if (!row) throw this.notFound();
    return { session: toMember(row) };
  }

  /** The calling user's membership in this gym — mirrors `MemberBookingsService`. */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ message: 'Session not found', code: 'SESSION_NOT_FOUND' });
  }
}

function personName(person: PersonRecord | null): string | null {
  if (!person) return null;
  const scoped = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return scoped || person.user.name || 'Member';
}

function toAdmin(row: SessionRecord): AdminServiceSession {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceName: row.service.name,
    serviceType: row.service.type,
    serviceCoverUrl: row.service.coverUrl,
    staffId: row.staffId,
    staffName: personName(row.staff) ?? 'Staff member',
    memberId: row.memberId,
    memberName: personName(row.member),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    status: row.status,
    invoice: row.invoice,
    notes: row.notes,
  };
}

function toSlot(row: SessionRecord): ServiceSlot {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceName: row.service.name,
    serviceType: row.service.type,
    staffName: personName(row.staff) ?? 'Staff member',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    priceMinor: row.service.priceMinor,
    currency: row.service.currency,
  };
}

function toMember(row: SessionRecord): MemberServiceSession {
  return {
    id: row.id,
    serviceId: row.serviceId,
    serviceName: row.service.name,
    serviceType: row.service.type,
    staffName: personName(row.staff) ?? 'Staff member',
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    invoice: row.invoice,
  };
}
