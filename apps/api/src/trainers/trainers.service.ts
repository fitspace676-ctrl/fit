import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassTemplateStatus,
  InstanceStatus,
  Prisma,
  ServiceSessionStatus,
  TrainerStatus,
} from '@fit/db';
import type {
  GetTrainerQuery,
  GetTrainerResponse,
  ListTrainersQuery,
  ListTrainersResponse,
  TrainerCard,
  TrainerScheduleEntry,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/** The columns a public trainer card needs, plus the studios their classes run in. */
const CARD_SELECT = {
  id: true,
  name: true,
  headline: true,
  bio: true,
  photoUrl: true,
  specialties: true,
  staffId: true,
  classTemplates: {
    where: { status: ClassTemplateStatus.ACTIVE },
    select: { location: { select: { name: true } } },
  },
} satisfies Prisma.TrainerSelect;

type CardRecord = Prisma.TrainerGetPayload<{ select: typeof CARD_SELECT }>;

/** How far ahead the detail page's schedule looks. */
const SCHEDULE_LIMIT = 20;

/**
 * Public trainer discovery behind `GET /trainers` and `GET /trainers/:id` — the
 * member portal's roster and detail page. Reads the base (untenanted) Prisma
 * client constrained to the explicit `gymId` the page resolves from the
 * subdomain, like the public products and services listings. Only ACTIVE
 * trainers are listed; a deactivated one drops off the portal at once.
 */
@Injectable()
export class TrainersService {
  constructor(private readonly prisma: PrismaService) {}

  async listTrainers(query: ListTrainersQuery): Promise<ListTrainersResponse> {
    const rows = await this.prisma.client.trainer.findMany({
      where: { gymId: query.gymId, status: TrainerStatus.ACTIVE },
      select: CARD_SELECT,
      orderBy: { name: 'asc' },
    });
    return { trainers: rows.map(toCard) };
  }

  /**
   * One trainer's profile plus their upcoming classes. The lookup is pinned to
   * `query.gymId`, so an unknown or cross-tenant id is the same `404`.
   */
  async getTrainer(id: string, query: GetTrainerQuery): Promise<GetTrainerResponse> {
    const row = await this.prisma.client.trainer.findFirst({
      where: { id, gymId: query.gymId, status: TrainerStatus.ACTIVE },
      select: CARD_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Trainer ${id} not found`);
    }
    const instances = await this.prisma.client.classInstance.findMany({
      where: {
        gymId: query.gymId,
        trainerId: id,
        status: InstanceStatus.SCHEDULED,
        startsAt: { gte: new Date() },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        template: { select: { title: true } },
        classType: { select: { name: true } },
        location: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: SCHEDULE_LIMIT,
    });
    // The trainer's open service slots (personal training) are sessions too —
    // the ones a member can actually book from here.
    const slots = row.staffId
      ? await this.prisma.client.serviceSession.findMany({
          where: {
            gymId: query.gymId,
            staffId: row.staffId,
            status: ServiceSessionStatus.OPEN,
            startsAt: { gte: new Date() },
          },
          select: {
            id: true,
            serviceId: true,
            startsAt: true,
            endsAt: true,
            service: { select: { name: true } },
          },
          orderBy: { startsAt: 'asc' },
          take: SCHEDULE_LIMIT,
        })
      : [];
    const schedule: TrainerScheduleEntry[] = [
      ...instances.map(
        (instance): TrainerScheduleEntry => ({
          id: instance.id,
          title: instance.template?.title ?? instance.classType?.name ?? 'Class',
          startsAt: instance.startsAt.toISOString(),
          endsAt: instance.endsAt.toISOString(),
          locationName: instance.location?.name ?? '',
          kind: 'CLASS',
          serviceId: null,
        }),
      ),
      ...slots.map(
        (slot): TrainerScheduleEntry => ({
          id: slot.id,
          title: slot.service.name,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          locationName: '',
          kind: 'SERVICE',
          serviceId: slot.serviceId,
        }),
      ),
    ]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, SCHEDULE_LIMIT);
    return { trainer: { ...toCard(row), schedule } };
  }
}

function toCard(row: CardRecord): TrainerCard {
  const locationNames = Array.from(
    new Set(
      row.classTemplates
        .map((template) => template.location?.name ?? '')
        .filter((name) => name !== ''),
    ),
  );
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    bio: row.bio,
    // The card schema wants a URL or null; a stray non-URL value must not sink the roster.
    avatarUrl: row.photoUrl && /^https?:\/\//.test(row.photoUrl) ? row.photoUrl : null,
    specialties: row.specialties,
    locationNames,
  };
}
