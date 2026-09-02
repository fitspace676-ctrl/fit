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
  ListServiceCategoriesResponse,
  CreateServiceCategoryData,
  ServiceCategory,
  ListAdminServicesResponse,
  ListServiceStaffResponse,
  ServiceResponse,
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
  coverUrl: true,
  status: true,
  createdAt: true,
  staff: { select: STAFF_SELECT },
  category: { select: { id: true, name: true } },
} satisfies Prisma.ServiceSelect;

type ServiceRecord = Prisma.ServiceGetPayload<{ select: typeof SERVICE_SELECT }>;

/**
 * "Personal session" in each interface language a gym can pick. The owner's
 * word for the service (2026-09-02): it is one session with a trainer, and
 * "training" read as the whole programme.
 */
const PERSONAL_TRAINING_LABEL: Record<GymLanguage, string> = {
  ka: 'პერსონალური სესია',
  en: 'Personal session',
  ru: 'Персональная сессия',
};

/**
 * The generated name of a personal-training service, in the gym's own language:
 * `"პერსონალური სესია - ნინო ბერიძე"`. A plain hyphen, never an em or en
 * dash: the name reaches receipts, CSV exports and SMS, where a long dash
 * arrives mangled through anything that is not UTF-8 clean.
 */
export function personalTrainingName(staffName: string, language: GymLanguage): string {
  return `${PERSONAL_TRAINING_LABEL[language]} - ${staffName}`;
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
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
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

    const [rows, total, byType, archived, categories] = await Promise.all([
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
      this.prisma.client.serviceCategory.count(),
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
      summary: {
        total: personalTraining + custom,
        personalTraining,
        custom,
        categories,
        archived,
      },
    };
  }

  async getService(id: string): Promise<ServiceResponse> {
    return toRow(await this.requireService(id));
  }

  async createService(input: CreateServiceData): Promise<ServiceResponse> {
    const staff = await this.requireStaff(input.staffId, input.type);
    if (input.categoryId !== null) await this.requireCategory(input.categoryId);
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
        categoryId: input.categoryId,
      },
      select: SERVICE_SELECT,
    });
    return toRow(row);
  }

  async updateService(id: string, input: UpdateServiceData): Promise<ServiceResponse> {
    const existing = await this.requireService(id);
    const staff = input.staffId ? await this.requireStaff(input.staffId, existing.type) : null;
    if (input.categoryId) await this.requireCategory(input.categoryId);

    const data: Prisma.ServiceUncheckedUpdateInput = {
      ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(staff ? { staffId: staff.id } : {}),
    };
    if (existing.type === ServiceType.PERSONAL_TRAINING) {
      if (staff)
        data.name = personalTrainingName(displayName(staff), (await this.locale.get()).language);
    } else if (input.name !== undefined) {
      data.name = input.name;
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

  /** The gym's categories, by name, each with how many services it files. */
  async listCategories(): Promise<ListServiceCategoriesResponse> {
    const rows = await this.prisma.client.serviceCategory.findMany({
      select: { id: true, name: true, _count: { select: { services: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      data: rows.map((row) => ({ id: row.id, name: row.name, serviceCount: row._count.services })),
    };
  }

  /**
   * Make a category. The name is unique within the gym - the same word twice
   * is `409 SERVICE_CATEGORY_EXISTS` rather than two rows that look alike in
   * every picker.
   */
  async createCategory(input: CreateServiceCategoryData): Promise<ServiceCategory> {
    const taken = await this.prisma.client.serviceCategory.findFirst({
      where: { name: { equals: input.name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        message: 'A category with that name already exists',
        code: 'SERVICE_CATEGORY_EXISTS',
      });
    }
    const row = await this.prisma.client.serviceCategory.create({
      data: { gymId: this.tenant.gymId, name: input.name },
      select: { id: true, name: true },
    });
    return { id: row.id, name: row.name, serviceCount: 0 };
  }

  /**
   * Remove a category nothing is filed under. One in use is `409
   * SERVICE_CATEGORY_IN_USE`: the desk moves its services first, so a category
   * cannot vanish from a service behind someone's back.
   */
  async deleteCategory(id: string): Promise<void> {
    const row = await this.prisma.client.serviceCategory.findFirst({
      where: { id },
      select: { id: true, _count: { select: { services: true } } },
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Category not found',
        code: 'SERVICE_CATEGORY_NOT_FOUND',
      });
    }
    if (row._count.services > 0) {
      throw new ConflictException({
        message: 'Move its services to another category before deleting it',
        code: 'SERVICE_CATEGORY_IN_USE',
      });
    }
    await this.prisma.client.serviceCategory.delete({ where: { id }, select: { id: true } });
  }

  /** A category this gym has - a picked id that is not one is `422 SERVICE_CATEGORY_INVALID`. */
  private async requireCategory(id: string): Promise<void> {
    const row = await this.prisma.client.serviceCategory.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new UnprocessableEntityException({
        message: "Pick one of the gym's categories",
        code: 'SERVICE_CATEGORY_INVALID',
      });
    }
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
    coverUrl: row.coverUrl,
    category: row.category ? { id: row.category.id, name: row.category.name } : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
