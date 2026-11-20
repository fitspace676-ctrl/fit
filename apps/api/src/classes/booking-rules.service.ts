import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  AutomationTriggerType,
  BookingStatus,
  InstanceStatus,
  NotificationCategory,
  NotificationChannel,
  Prisma,
} from '@fit/db';
import {
  gymSettingsStoredSchema,
  isNoShowBlockRuleActive,
  type AdminBookingBlock,
  type GymNoShowSettings,
  type MemberBookingStanding,
} from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreditPacksService,
  type CreditPackTransactionClient,
} from '../billing/credit-packs.service';
import { NotificationService } from '../notifications/notification.service';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { ClassOccupancyPublisher } from './class-occupancy.publisher';
import { contactEmail } from '../common/directory-identity';
import { releaseBooking } from './release-booking';

const DAY = 86_400_000;
const BLOCK_INCLUDE = {
  member: { select: { userId: true, user: { select: { name: true, email: true } } } },
  liftedBy: { select: { name: true } },
} satisfies Prisma.BookingBlockInclude;
type BlockRow = Prisma.BookingBlockGetPayload<{ include: typeof BLOCK_INCLUDE }>;

/** Explicit gym scoping supports both HTTP requests and the tenantless sweep. */
@Injectable()
export class BookingRulesService {
  private readonly logger = new Logger(BookingRulesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditPacks: CreditPacksService,
    private readonly notifications: NotificationService,
    private readonly automation: AutomationExecutorService,
    private readonly occupancy: ClassOccupancyPublisher,
  ) {}

  async settings(gymId: string) {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: { settings: true },
    });
    return gymSettingsStoredSchema.parse(gym?.settings ?? {});
  }

  activeBlock(
    gymId: string,
    memberId: string,
    now = new Date(),
    tx: Prisma.TransactionClient | CreditPackTransactionClient = this.prisma.client,
  ) {
    return (tx as Prisma.TransactionClient).bookingBlock.findFirst({
      where: { gymId, memberId, liftedAt: null, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      include: BLOCK_INCLUDE,
    });
  }

  /** The same lock is taken by member booking, so a new booking cannot race a block. */
  async lockMember(
    tx: Prisma.TransactionClient | CreditPackTransactionClient,
    gymId: string,
    memberId: string,
  ) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${gymId}:${memberId}`}, 0))::text`;
  }

  async assertCanBook(
    gymId: string,
    memberId: string,
    tx: Prisma.TransactionClient | CreditPackTransactionClient,
  ) {
    await this.lockMember(tx, gymId, memberId);
    const block = await this.activeBlock(gymId, memberId, new Date(), tx);
    if (block)
      throw new ForbiddenException({
        code: 'MEMBER_BOOKING_BLOCKED',
        message: 'Class booking is temporarily blocked',
        data: { blockedUntil: block.endsAt.toISOString(), reason: block.reason },
      });
  }

  async strikes(
    gymId: string,
    memberId: string,
    rule: GymNoShowSettings,
    at: Date,
    tx: Prisma.TransactionClient | CreditPackTransactionClient = this.prisma.client,
    excludeBlockId?: string,
  ) {
    // A lifted block ends at liftedAt; an expired block ends at endsAt. A
    // correction must not erase the strikes that remain valid.
    const ended = await (tx as Prisma.TransactionClient).bookingBlock.findMany({
      where: {
        gymId,
        memberId,
        ...(excludeBlockId ? { id: { not: excludeBlockId } } : {}),
        AND: [
          { OR: [{ liftReason: null }, { liftReason: { not: 'CORRECTION' } }] },
          { OR: [{ liftedAt: { lt: at } }, { liftedAt: null, endsAt: { lt: at } }] },
        ],
      },
      select: { liftedAt: true, endsAt: true },
    });
    const floor = new Date(
      Math.max(
        at.getTime() - rule.strikeWindowDays * DAY,
        rule.strikesSince ? new Date(rule.strikesSince).getTime() : 0,
        ...ended.map((b) => (b.liftedAt ?? b.endsAt).getTime()),
      ),
    );
    return (tx as Prisma.TransactionClient).booking.findMany({
      where: {
        gymId,
        memberId,
        status: BookingStatus.NO_SHOW,
        classInstance: { gymId, startsAt: { gt: floor, lte: at } },
      },
      select: { id: true },
      orderBy: { classInstance: { startsAt: 'desc' } },
    });
  }

  async evaluateMember(gymId: string, memberId: string, now = new Date()): Promise<void> {
    const { noShow } = await this.settings(gymId);
    if (!isNoShowBlockRuleActive(noShow)) return;
    const outcome = await this.prisma.client.$transaction(async (tx) => {
      await this.lockMember(tx, gymId, memberId);
      if (await this.activeBlock(gymId, memberId, now, tx)) return null;
      const strikes = await this.strikes(gymId, memberId, noShow, now, tx);
      if (strikes.length < noShow.strikeLimit)
        return {
          warningId:
            noShow.strikeLimit > 1 && strikes.length === noShow.strikeLimit - 1
              ? strikes[0]?.id
              : undefined,
        };
      const block = await tx.bookingBlock.create({
        data: {
          gymId,
          memberId,
          reason: 'NO_SHOW_LIMIT',
          noShowCount: strikes.length,
          startsAt: now,
          endsAt: new Date(now.getTime() + noShow.blockDays * DAY),
        },
        include: BLOCK_INCLUDE,
      });
      const bookings = await tx.booking.findMany({
        where: {
          gymId,
          memberId,
          status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLIST] },
          classInstance: {
            gymId,
            status: InstanceStatus.SCHEDULED,
            startsAt: { gt: now, lt: block.endsAt },
          },
        },
        orderBy: { classInstanceId: 'asc' },
      });
      const releases: { instanceId: string; promotedId: string | null }[] = [];
      for (const booking of bookings) {
        // Lock the booking row before re-reading: a concurrent member cancel
        // must not refund or release the same seat twice.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} AND "gymId" = ${gymId} FOR UPDATE`;
        const current = await tx.booking.findFirst({
          where: {
            id: booking.id,
            gymId,
            status: { in: [BookingStatus.BOOKED, BookingStatus.WAITLIST] },
          },
        });
        if (!current) continue;
        const promotedId = await releaseBooking(
          tx as unknown as CreditPackTransactionClient,
          this.creditPacks,
          booking.classInstanceId,
          current,
          gymId,
        );
        releases.push({ instanceId: booking.classInstanceId, promotedId });
      }
      return { block, releases };
    });
    if (!outcome) return;
    if ('block' in outcome && outcome.block) {
      for (const release of outcome.releases) {
        await this.occupancy.publishForGym(gymId, release.instanceId).catch(() => undefined);
        if (release.promotedId)
          await this.automation
            .dispatchForGym(gymId, AutomationTriggerType.class_booked, {
              entityId: release.promotedId,
              entityType: 'booking',
            })
            .catch(() => undefined);
      }
      await this.notify(gymId, memberId, 'blocked', outcome.block.id, outcome.block.endsAt);
    } else if (outcome.warningId) await this.notify(gymId, memberId, 'warning', outcome.warningId);
  }

  async onNoShowCorrected(gymId: string, memberId: string): Promise<void> {
    const { noShow } = await this.settings(gymId);
    if (!isNoShowBlockRuleActive(noShow)) return;
    const lifted = await this.prisma.client.$transaction(async (tx) => {
      await this.lockMember(tx, gymId, memberId);
      const block = await this.activeBlock(gymId, memberId, new Date(), tx);
      if (!block || block.reason !== 'NO_SHOW_LIMIT') return null;
      const strikes = await this.strikes(gymId, memberId, noShow, block.startsAt, tx, block.id);
      if (strikes.length >= noShow.strikeLimit) return null;
      await tx.bookingBlock.update({
        where: { id: block.id, gymId },
        data: { liftedAt: new Date(), liftReason: 'CORRECTION' },
      });
      return block;
    });
    if (lifted) await this.notify(gymId, memberId, 'unblocked', lifted.id);
  }

  async liftBlock(gymId: string, blockId: string, staffUserId: string): Promise<AdminBookingBlock> {
    const now = new Date();
    const block = await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.bookingBlock.updateMany({
        where: { id: blockId, gymId, liftedAt: null, endsAt: { gt: now } },
        data: { liftedAt: now, liftedByUserId: staffUserId, liftReason: 'STAFF' },
      });
      if (changed.count !== 1)
        throw new ConflictException({
          code: 'BOOKING_BLOCK_NOT_ACTIVE',
          message: 'This booking block is no longer active',
        });
      return tx.bookingBlock.findFirstOrThrow({
        where: { id: blockId, gymId },
        include: BLOCK_INCLUDE,
      });
    });
    await this.notify(gymId, block.memberId, 'unblocked', block.id);
    return this.project(block, now);
  }

  async getStanding(gymId: string, memberId: string): Promise<MemberBookingStanding> {
    const settings = await this.settings(gymId);
    const rule = settings.noShow;
    const active = isNoShowBlockRuleActive(rule);
    const now = new Date();
    const count = active ? (await this.strikes(gymId, memberId, rule, now)).length : 0;
    const block = await this.activeBlock(gymId, memberId, now);
    return {
      cancellationCutoffHours: settings.booking.cancellationCutoffHours,
      noShow: {
        active,
        limit: rule.strikeLimit,
        windowDays: rule.strikeWindowDays,
        blockDays: rule.blockDays,
        count,
        remaining: active ? rule.strikeLimit - count : null,
      },
      block: block ? { until: block.endsAt.toISOString(), reason: block.reason } : null,
    };
  }

  async listBlocks(gymId: string, options: { status?: 'active' | 'all'; memberId?: string }) {
    const now = new Date();
    const rows = await this.prisma.client.bookingBlock.findMany({
      where: {
        gymId,
        ...(options.memberId ? { memberId: options.memberId } : {}),
        ...(options.status === 'all' ? {} : { liftedAt: null, endsAt: { gt: now } }),
      },
      include: BLOCK_INCLUDE,
      orderBy: { startsAt: 'desc' },
    });
    return { blocks: rows.map((b) => this.project(b, now)) };
  }

  private project(b: BlockRow, now: Date): AdminBookingBlock {
    return {
      id: b.id,
      memberId: b.memberId,
      memberName: b.member.user.name ?? '',
      memberEmail: contactEmail(b.member.user.email),
      reason: b.reason,
      noShowCount: b.noShowCount,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      liftedAt: b.liftedAt?.toISOString() ?? null,
      liftedByName: b.liftedBy?.name ?? null,
      liftReason: b.liftReason,
      active: b.liftedAt === null && b.endsAt > now,
    };
  }

  /** False leaves expiry eligible for retry; notification dedupe handles overlaps. */
  async notify(
    gymId: string,
    memberId: string,
    kind: 'blocked' | 'warning' | 'unblocked',
    id: string,
    until?: Date,
  ): Promise<boolean> {
    try {
      const settings = await this.settings(gymId);
      const member = await this.prisma.client.gymMember.findFirst({
        where: { id: memberId, gymId },
        select: { userId: true },
      });
      if (!member) return true;
      const ka = settings.locale.language === 'ka';
      const rule = settings.noShow;
      const when = until
        ? new Intl.DateTimeFormat(ka ? 'ka-GE' : 'en-US', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: settings.locale.timezone,
          }).format(until)
        : '';
      const copy =
        kind === 'blocked'
          ? {
              title: ka
                ? 'კლასებზე ჯავშანი დროებით შეზღუდულია'
                : 'Class booking temporarily blocked',
              body: ka
                ? `${rule.strikeWindowDays} დღეში ${rule.strikeLimit} გაცდენის გამო კლასების დაჯავშნა შეზღუდულია ${when}-მდე. ამ პერიოდში დაგეგმილი ჯავშნები გაუქმდა, გამოყენებული კრედიტები კი დაგიბრუნდათ.`
                : `After ${rule.strikeLimit} no-shows in ${rule.strikeWindowDays} days, class booking is blocked until ${when}. Bookings during this period were cancelled and credits refunded.`,
            }
          : kind === 'warning'
            ? {
                title: ka ? 'გაცდენის შესახებ გაფრთხილება' : 'No-show warning',
                body: ka
                  ? `კიდევ ერთი გაცდენის შემთხვევაში კლასების დაჯავშნა ${rule.blockDays} დღით შეგეზღუდებათ.`
                  : `One more no-show will block class booking for ${rule.blockDays} days.`,
              }
            : {
                title: ka ? 'კლასებზე ჯავშნის შეზღუდვა მოიხსნა' : 'Class booking unblocked',
                body: ka
                  ? 'კლასების დაჯავშნა კვლავ შეგიძლიათ. ადრე გაუქმებული ჯავშნები ავტომატურად არ აღდგება.'
                  : 'You can book classes again. Previously cancelled bookings are not restored automatically.',
              };
      await this.notifications.send({
        gymId,
        userId: member.userId,
        category: NotificationCategory.BOOKING,
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
        href: '/account/bookings',
        dedupeKey: `${kind === 'blocked' ? 'booking-block' : kind === 'unblocked' ? 'booking-unblock' : 'noshow-warning'}:${id}`,
        ...copy,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Booking rule notification failed: ${String(error)}`);
      return false;
    }
  }
}
