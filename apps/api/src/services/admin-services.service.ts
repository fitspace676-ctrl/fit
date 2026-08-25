import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ServiceSessionStatus, ServiceStatus, ServiceType } from '@fit/db';
import type {
  AdminServiceRow,
  GymLanguage,
  AdminServiceStaff,
  CreateServiceData,
  ListAdminServicesQuery,
  ListAdminServicesResponse,
  ListServiceStaffResponse,
  ServiceResponse,
  ServiceSchedule,
  UpdateServiceData,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';

/** The staff columns a service row and the picker both need. */
const STAFF_SELECT = {
  id: true,
  role: true,
  firstName: true,
  lastName: true,
  user: { select: { name: true } },
  trainerProfile: { select: { id: true, photoUrl: true } },
} satisfies Prisma.GymMemberSelect;

type StaffRecord = Prisma.GymMemberGetPayload<{ select: typeof STAFF_SELECT }>;

/** The service columns the console renders. */
const SERVICE_SELECT = {
  id: true,
  type: true,
  name: true,
  priceMinor: true,
  currency: true,
  durationMinutes: true,
  description: true,
  schedule: true,
  coverUrl: true,
  status: true,
  createdAt: true,
  staff: { select: STAFF_SELECT },
} satisfies Prisma.ServiceSelect;

type ServiceRecord = Prisma.ServiceGetPayload<{ select: typeof SERVICE_SELECT }>;

/** "Personal training" in each interface language a gym can pick. */
const PERSONAL_TRAINING_LABEL: Record<GymLanguage, string> = {
  ka: 'პერსონალური ვარჯიში',
  en: 'Personal training',
  ru: 'Персональная тренировка',
};

/**
 * The generated name of a personal-training service, in the gym's own language:
 * `"პერსონალური ვარჯიში - ნინო ბერიძე"`. A plain hyphen, never an em or en
 * dash: the name reaches receipts, CSV exports and SMS, where a long dash
 * arrives mangled through anything that is not UTF-8 clean.
 */
export function personalTrainingName(staffName: string, language: GymLanguage): string {
  return `${PERSONAL_TRAINING_LABEL[language]} - ${staffName}`;
}

/** A schedule as the `Json?` column stores it — `null` becomes SQL NULL, not the JSON `null`. */
function toScheduleColumn(
  schedule: ServiceSchedule | null,
): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  return schedule === null ? Prisma.JsonNull : schedule;
}

/** The name staff see for a member row: the gym-scoped name, else the account name. */
function displayName(staff: StaffRecord): string {
  const scoped = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
  return scoped || staff.user.name || 'Staff member';
}

/**
 * A service's assigned staff member as the console renders it. `User` has no
 * `image` column, so a photo only ever comes from a trainer profile — staff with
 * no such profile show no photo, whatever service they're assigned to.
 */
function toStaff(staff: StaffRecord): AdminServiceStaff {
  return {
    id: staff.id,
    name: displayName(staff),
    photoUrl: staff.trainerProfile?.photoUrl ?? null,
    isTrainer: staff.trainerProfile !== null,
  };
}

/**
 * The Services catalogue (`/admin/services`, stage 1 of the Services design).
 * Tenant-scoped through {@link TenantPrismaService}; the gym id is only ever
 * stamped on a create.
 */
@Injectable()
export class AdminServicesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly locale: GymLocaleService,
  ) {}

  async listServices(query: ListAdminServicesQuery): Promise<ListAdminServicesResponse> {
    const where: Prisma.ServiceWhereInput = {
      status: query.status,
      ...(query.type ? { type: query.type } : {}),
      ...(query.staffId ? { staffId: query.staffId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.ServiceOrderByWithRelationInput =
      query.sort === 'price'
        ? { priceMinor: query.dir }
        : query.sort === 'createdAt'
          ? { createdAt: query.dir }
          : { name: query.dir };
    const skip = (query.page - 1) * query.limit;

    const [rows, total, byType, archived] = await Promise.all([
      this.prisma.client.service.findMany({
        where,
        select: SERVICE_SELECT,
        orderBy,
        skip,
        take: query.limit,
      }),
      this.prisma.client.service.count({ where }),
      this.prisma.client.service.groupBy({
        by: ['type'],
        where: { status: ServiceStatus.ACTIVE },
        _count: { _all: true },
      }),
      this.prisma.client.service.count({ where: { status: ServiceStatus.ARCHIVED } }),
    ]);

    const countOf = (type: ServiceType) =>
      byType.find((group) => group.type === type)?._count._all ?? 0;
    const personalTraining = countOf(ServiceType.PERSONAL_TRAINING);
    const custom = countOf(ServiceType.CUSTOM);

    return {
      data: rows.map(toRow),
      total,
      page: query.page,
      limit: query.limit,
      summary: { total: personalTraining + custom, personalTraining, custom, archived },
    };
  }

  async getService(id: string): Promise<ServiceResponse> {
    return toRow(await this.requireService(id));
  }

  async createService(input: CreateServiceData): Promise<ServiceResponse> {
    const staff = await this.requireStaff(input.staffId, input.type);
    const { currency, language } = await this.locale.get();

    const row = await this.prisma.client.service.create({
      data: {
        gymId: this.tenant.gymId,
        type: input.type,
        name:
          input.type === 'PERSONAL_TRAINING'
            ? personalTrainingName(displayName(staff), language)
            : input.name,
        staffId: staff.id,
        priceMinor: input.priceMinor,
        currency,
        durationMinutes: input.durationMinutes,
        description: input.description,
        coverUrl: input.coverUrl,
        schedule: toScheduleColumn(input.schedule),
      },
      select: SERVICE_SELECT,
    });
    return toRow(row);
  }

  async updateService(id: string, input: UpdateServiceData): Promise<ServiceResponse> {
    const existing = await this.requireService(id);
    const staff = input.staffId ? await this.requireStaff(input.staffId, existing.type) : null;

    const data: Prisma.ServiceUncheckedUpdateInput = {
      ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      ...(staff ? { staffId: staff.id } : {}),
    };
    if (existing.type === ServiceType.PERSONAL_TRAINING) {
      if (staff)
        data.name = personalTrainingName(displayName(staff), (await this.locale.get()).language);
      if (input.schedule !== undefined) data.schedule = toScheduleColumn(input.schedule);
    } else {
      if (input.name !== undefined) data.name = input.name;
      if (input.schedule === null) {
        throw new UnprocessableEntityException({
          message: 'A custom service needs a schedule',
          code: 'SERVICE_SCHEDULE_REQUIRED',
        });
      }
      if (input.schedule !== undefined) data.schedule = toScheduleColumn(input.schedule);
    }

    const row = await this.prisma.client.service.update({
      where: { id },
      data,
      select: SERVICE_SELECT,
    });
    return toRow(row);
  }

  async archiveService(id: string): Promise<ServiceResponse> {
    return this.setStatus(id, ServiceStatus.ARCHIVED);
  }

  async restoreService(id: string): Promise<ServiceResponse> {
    return this.setStatus(id, ServiceStatus.ACTIVE);
  }

  /**
   * Permanently delete an ARCHIVED service. Its open / cancelled slots go with
   * it; a service that was ever booked or delivered is kept (`409
   * SERVICE_HAS_SESSIONS`) because those sessions carry invoices and history.
   * Sale lines that referenced it keep their snapshot (`OrderItem.serviceId` is
   * set null by the schema).
   */
  async deleteService(id: string): Promise<void> {
    const existing = await this.requireService(id);
    if (existing.status !== ServiceStatus.ARCHIVED) {
      throw new ConflictException({
        message: 'Archive the service before deleting it',
        code: 'SERVICE_NOT_ARCHIVED',
      });
    }
    const delivered = await this.prisma.client.serviceSession.count({
      where: {
        serviceId: id,
        status: { in: [ServiceSessionStatus.BOOKED, ServiceSessionStatus.COMPLETED] },
      },
    });
    if (delivered > 0) {
      throw new ConflictException({
        message: 'This service has booked or completed sessions and cannot be deleted',
        code: 'SERVICE_HAS_SESSIONS',
      });
    }
    await this.prisma.client.$transaction([
      this.prisma.client.serviceSession.deleteMany({ where: { serviceId: id } }),
      this.prisma.client.service.delete({ where: { id }, select: { id: true } }),
    ]);
  }

  /** Staff the form can assign: every non-MEMBER, non-deleted person in the gym. */
  async listStaffOptions(): Promise<ListServiceStaffResponse> {
    const rows = await this.prisma.client.gymMember.findMany({
      where: { role: { not: 'MEMBER' }, deletedAt: null },
      select: STAFF_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return {
      data: rows.map((staff) => ({
        id: staff.id,
        name: displayName(staff),
        role: staff.role,
        photoUrl: staff.trainerProfile?.photoUrl ?? null,
        isTrainer: staff.trainerProfile !== null,
      })),
    };
  }

  private async setStatus(id: string, status: ServiceStatus): Promise<ServiceResponse> {
    await this.requireService(id);
    const row = await this.prisma.client.service.update({
      where: { id },
      data: { status },
      select: SERVICE_SELECT,
    });
    return toRow(row);
  }

  private async requireService(id: string): Promise<ServiceRecord> {
    const row = await this.prisma.client.service.findFirst({
      where: { id },
      select: SERVICE_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Service not found', code: 'SERVICE_NOT_FOUND' });
    }
    return row;
  }

  /**
   * The staff member a service may be assigned to: a non-MEMBER, non-deleted
   * person in this gym, and — for a PT service — one with a trainer profile.
   */
  private async requireStaff(
    staffId: string,
    type: ServiceType | 'PERSONAL_TRAINING' | 'CUSTOM',
  ): Promise<StaffRecord> {
    const staff = await this.prisma.client.gymMember.findFirst({
      where: { id: staffId, role: { not: 'MEMBER' }, deletedAt: null },
      select: STAFF_SELECT,
    });
    if (!staff) {
      throw new UnprocessableEntityException({
        message: 'Pick a staff member of this gym',
        code: 'SERVICE_STAFF_INVALID',
      });
    }
    if (type === 'PERSONAL_TRAINING' && !staff.trainerProfile) {
      throw new UnprocessableEntityException({
        message: 'A personal-training service needs a staff member with a trainer profile',
        code: 'SERVICE_STAFF_NOT_TRAINER',
      });
    }
    return staff;
  }
}

function toRow(row: ServiceRecord): AdminServiceRow {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    staff: toStaff(row.staff),
    priceMinor: row.priceMinor,
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    description: row.description,
    schedule: (row.schedule as ServiceSchedule | null) ?? null,
    coverUrl: row.coverUrl,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
