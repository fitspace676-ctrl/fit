import { Injectable } from '@nestjs/common';
import { Prisma, ServiceStatus } from '@fit/db';
import type { ListServicesQuery, ListServicesResponse, ServiceCard } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/** The columns a portal card needs. */
const CARD_SELECT = {
  id: true,
  type: true,
  name: true,
  description: true,
  priceMinor: true,
  currency: true,
  durationMinutes: true,
  coverUrl: true,
  category: { select: { name: true } },
  staff: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      user: { select: { name: true } },
      trainerProfile: { select: { photoUrl: true } },
    },
  },
} satisfies Prisma.ServiceSelect;

type CardRecord = Prisma.ServiceGetPayload<{ select: typeof CARD_SELECT }>;

/**
 * The public services catalogue behind `GET /services?gymId=<id>` — what a
 * member (or a signed-out visitor) sees on the portal's Services page. Reads the
 * base (untenanted) Prisma client constrained to the explicit `gymId`, exactly
 * like the public products and trainers listings; only ACTIVE services are
 * listed, archived ones are gone from the portal the moment staff archive them.
 */
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listServices(query: ListServicesQuery): Promise<ListServicesResponse> {
    const rows = await this.prisma.client.service.findMany({
      where: { gymId: query.gymId, status: ServiceStatus.ACTIVE },
      select: CARD_SELECT,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return { services: rows.map(toCard) };
  }
}

function toCard(row: CardRecord): ServiceCard {
  const scoped = [row.staff.firstName, row.staff.lastName].filter(Boolean).join(' ').trim();
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    priceMinor: row.priceMinor,
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    coverUrl: row.coverUrl,
    category: row.category?.name ?? null,
    staff: {
      id: row.staff.id,
      name: scoped || row.staff.user.name || 'Staff member',
      photoUrl: row.staff.trainerProfile?.photoUrl ?? null,
    },
  };
}
