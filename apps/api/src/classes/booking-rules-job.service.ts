import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationTriggerType, BookingStatus, InstanceStatus } from '@fit/db';
import { gymSettingsStoredSchema, isNoShowBlockRuleActive } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { BookingRulesService } from './booking-rules.service';

export const NO_SHOW_GRACE_MINUTES = 30;
const DAY = 86_400_000;
@Injectable()
export class BookingRulesJobService {
  private readonly logger = new Logger(BookingRulesJobService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rules: BookingRulesService,
    private readonly automation: AutomationExecutorService,
  ) {}

  @Cron('*/5 * * * *', { name: 'class-booking-rules' })
  async runScheduled(): Promise<void> {
    if (!env.CLASS_BOOKING_RULES_ENABLED) return;
    try {
      const key = `class-booking-rules:lock:${new Date().toISOString().slice(0, 16)}`;
      if ((await this.redis.client.set(key, '1', 'EX', 240, 'NX')) !== 'OK') return;
      await this.runSweep();
    } catch (error) {
      this.logger.warn(`Class booking rules sweep failed: ${String(error)}`);
    }
  }

  async runSweep(options?: { now?: Date }) {
    const now = options?.now ?? new Date();
    const summary = { attended: 0, noShows: 0, expired: 0, errors: 0 };
    const gyms = await this.prisma.client.gym.findMany({ select: { id: true, settings: true } });
    for (const gym of gyms) {
      try {
        const rule = gymSettingsStoredSchema.parse(gym.settings ?? {}).noShow;
        if (!isNoShowBlockRuleActive(rule)) continue;
        const floor = new Date(
          Math.max(
            now.getTime() - 7 * DAY,
            rule.strikesSince ? new Date(rule.strikesSince).getTime() : 0,
          ),
        );
        const bookings = await this.prisma.client.booking.findMany({
          where: {
            gymId: gym.id,
            status: BookingStatus.BOOKED,
            classInstance: {
              gymId: gym.id,
              status: { not: InstanceStatus.CANCELED },
              endsAt: { gt: floor, lte: new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60_000) },
            },
          },
          select: {
            id: true,
            memberId: true,
            classInstance: { select: { startsAt: true, endsAt: true } },
          },
        });
        const members = new Set<string>();
        for (const booking of bookings) {
          try {
            const checkIn = await this.prisma.client.checkIn.findFirst({
              where: {
                gymId: gym.id,
                gymMemberId: booking.memberId,
                checkedInAt: {
                  gte: new Date(booking.classInstance.startsAt.getTime() - 120 * 60_000),
                  lte: booking.classInstance.endsAt,
                },
              },
              select: { id: true },
            });
            const status = checkIn ? BookingStatus.ATTENDED : BookingStatus.NO_SHOW;
            const changed = await this.prisma.client.booking.updateMany({
              where: {
                id: booking.id,
                gymId: gym.id,
                status: BookingStatus.BOOKED,
                classInstance: { gymId: gym.id, status: { not: InstanceStatus.CANCELED } },
              },
              data: { status },
            });
            if (!changed.count) continue;
            if (status === BookingStatus.NO_SHOW) {
              summary.noShows++;
              members.add(booking.memberId);
            } else summary.attended++;
            await this.automation
              .dispatchForGym(gym.id, AutomationTriggerType.attendance_marked, {
                entityId: booking.id,
                entityType: 'booking',
              })
              .catch(() => undefined);
            if (status === BookingStatus.ATTENDED) {
              const count = await this.prisma.client.booking.count({
                where: {
                  gymId: gym.id,
                  memberId: booking.memberId,
                  status: BookingStatus.ATTENDED,
                },
              });
              if (count === 1)
                await this.automation
                  .dispatchForGym(gym.id, AutomationTriggerType.first_class_attended, {
                    entityId: booking.id,
                    entityType: 'booking',
                  })
                  .catch(() => undefined);
            }
          } catch (error) {
            summary.errors++;
            this.logger.warn(`Automatic attendance ${booking.id}: ${String(error)}`);
          }
        }
        // Retry previously recorded no-shows too, so a transient evaluation
        // failure after the attendance commit cannot permanently miss a block.
        const pending = await this.prisma.client.booking.findMany({
          where: {
            gymId: gym.id,
            status: BookingStatus.NO_SHOW,
            classInstance: {
              gymId: gym.id,
              startsAt: {
                gt: new Date(
                  Math.max(
                    now.getTime() - rule.strikeWindowDays * DAY,
                    rule.strikesSince ? new Date(rule.strikesSince).getTime() : 0,
                  ),
                ),
                lte: now,
              },
            },
          },
          select: { memberId: true },
          distinct: ['memberId'],
        });
        for (const row of pending) members.add(row.memberId);
        for (const memberId of members) {
          try {
            await this.rules.evaluateMember(gym.id, memberId, now);
          } catch (error) {
            summary.errors++;
            this.logger.warn(`Booking rules member ${memberId}: ${String(error)}`);
          }
        }
      } catch (error) {
        summary.errors++;
        this.logger.warn(`Booking rules gym ${gym.id}: ${String(error)}`);
      }
    }
    const expired = await this.prisma.client.bookingBlock.findMany({
      where: { endsAt: { lte: now }, liftedAt: null, expiryNotifiedAt: null },
      select: { id: true, gymId: true, memberId: true },
    });
    for (const block of expired) {
      try {
        if (!(await this.rules.notify(block.gymId, block.memberId, 'unblocked', block.id))) {
          summary.errors++;
          continue;
        }
        await this.prisma.client.bookingBlock.updateMany({
          where: {
            id: block.id,
            gymId: block.gymId,
            liftedAt: null,
            expiryNotifiedAt: null,
            endsAt: { lte: now },
          },
          data: { expiryNotifiedAt: now },
        });
        summary.expired++;
      } catch (error) {
        summary.errors++;
        this.logger.warn(`Booking rules expiry ${block.id}: ${String(error)}`);
      }
    }
    return summary;
  }
}
