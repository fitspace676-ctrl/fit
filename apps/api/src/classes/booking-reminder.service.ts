import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BookingStatus, InstanceStatus, NotificationCategory, NotificationChannel } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import { NotificationService } from '../notifications/notification.service';
import { resolveEmailLocale, type EmailLocale } from '../notifications/notification-email';

/** In-app deep link the reminder routes to — the member portal's bookings screen. */
const REMINDER_HREF = '/account/bookings';

/**
 * The channels a reminder is offered on: the member's inbox plus their email and
 * push. This is the *requested* set — {@link NotificationService.send} subtracts
 * each member's per-channel opt-outs, so a member who muted push (or email) for
 * the BOOKING category still gets the ones they left on ("preferred channels").
 */
const REMINDER_CHANNELS: readonly NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
];

/** Cron: every five minutes — fine-grained enough that the reminder lands close to
 *  its lead time, cheap enough to run as one indexed window query per tick. */
const REMINDER_CRON = '*/5 * * * *';

/** How long the per-tick Redis lock is held — long enough to dedupe replicas firing
 *  the same minute, short enough to expire well before the next five-minute tick. */
const LOCK_TTL_SECONDS = 240;

/** A confirmed booking due for a reminder, as the sweep's `select` projects it. */
interface RemindableBooking {
  id: string;
  gymId: string;
  userId: string;
  classTitle: string;
  startsAt: Date;
}

/**
 * The outcome of one reminder tick, returned by {@link BookingReminderService.runReminders}
 * for logging and assertion. Every matched booking lands in exactly one of
 * `reminded` / `deduped` / `errors`.
 */
export interface BookingReminderRunSummary {
  /** The instant the tick evaluated against (ISO-8601). */
  now: string;
  /** The exclusive upper bound of the reminder window (`now + lead`, ISO-8601). */
  windowEnd: string;
  /** How many confirmed bookings fell inside the window this tick. */
  bookingsMatched: number;
  /** Reminders freshly delivered (at least one channel, not previously sent). */
  reminded: number;
  /** Bookings skipped because a reminder had already been sent (dedupe backstop). */
  deduped: number;
  /** Bookings left unremindered by a per-booking failure, to retry next tick. */
  errors: number;
}

/**
 * Class booking reminder job (T8.6).
 *
 * The scheduled sweep that nudges every member ahead of a class they hold a
 * confirmed seat for. Each tick finds the `BOOKED` bookings whose `SCHEDULED`
 * occurrence starts within the lead window (`(now, now + lead]`, two hours by
 * default) and sends one reminder per booking through the {@link NotificationService}
 * dispatch seam — fanning out over the member's inbox, email, and push, minus the
 * channels they have muted for the BOOKING category ("preferred channels"). The
 * reminder copy is localised to the gym's interface language and its start time
 * formatted in the gym's timezone.
 *
 * Only a live seat is reminded: `WAITLIST` entries hold no seat, and
 * `CANCELED` / `ATTENDED` / `NO_SHOW` bookings — and `CANCELED` / `COMPLETED`
 * occurrences — are all excluded by the query, so a member who cancelled or already
 * attended is never pinged.
 *
 * Like the other scheduled jobs it is **cross-tenant** — it reads every gym's
 * bookings through the unscoped {@link PrismaService} (the sweep has no request
 * tenant context) — and is gated two ways so it is safe in every environment:
 *   • `BOOKING_REMINDERS_ENABLED` must be true (off in dev / CI / preview by
 *     default), so no reminder ever fires unexpectedly.
 *   • a Redis `SET NX` lock per tick means a multi-instance deployment runs the
 *     sweep once even though every replica fires the cron.
 *
 * **Idempotency** holds independently of the lock, at the notification layer: every
 * send carries a per-booking `dedupeKey` (`booking-reminder:<bookingId>`), and the
 * `(userId, dedupeKey)` unique index means the same booking is reminded at most once
 * — so overlapping windows, a re-run, or a racing replica all collapse to one
 * reminder. That backstop is also what lets the window be a robust `(now, now + lead]`
 * range rather than a fragile exact-instant match: a missed tick just reminds the
 * still-upcoming bookings on the next one, never twice.
 */
@Injectable()
export class BookingReminderService {
  private readonly logger = new Logger(BookingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  /** Five-minute cron entry point. */
  @Cron(REMINDER_CRON, { name: 'booking-reminders' })
  async runScheduled(): Promise<void> {
    if (!env.BOOKING_REMINDERS_ENABLED) {
      this.logger.debug('Booking reminders disabled (BOOKING_REMINDERS_ENABLED unset) — skipping');
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.debug('Another instance holds the reminder lock — skipping');
      return;
    }

    try {
      const summary = await this.runReminders();
      if (summary.bookingsMatched > 0) {
        this.logger.log(
          `Booking reminders: ${summary.reminded} sent, ${summary.deduped} already sent, ` +
            `${summary.errors} errors across ${summary.bookingsMatched} due`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Booking reminders failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Remind every confirmed booking whose occurrence starts within the lead window.
   * Each booking is sent independently: a failure on one (a channel transport that
   * throws) is tallied as an `error` and never aborts the rest of the sweep. Kept
   * separate from {@link runScheduled} so the sweep itself stays a plain,
   * unit-testable method with no scheduling side effects; `now` is injectable for
   * deterministic tests.
   */
  async runReminders(options?: { now?: Date }): Promise<BookingReminderRunSummary> {
    const now = options?.now ?? new Date();
    const windowEnd = new Date(now.getTime() + env.BOOKING_REMINDER_LEAD_MINUTES * 60_000);

    const due = await this.findDueBookings(now, windowEnd);

    const summary: BookingReminderRunSummary = {
      now: now.toISOString(),
      windowEnd: windowEnd.toISOString(),
      bookingsMatched: due.length,
      reminded: 0,
      deduped: 0,
      errors: 0,
    };

    // The gym's language + timezone drive the reminder copy; resolve each gym once
    // per sweep since a batch is typically many bookings across a few gyms.
    const localeCache = new Map<string, GymReminderLocale>();

    for (const booking of due) {
      try {
        const locale = await this.resolveGymLocale(booking.gymId, localeCache);
        const result = await this.notifications.send({
          gymId: booking.gymId,
          userId: booking.userId,
          category: NotificationCategory.BOOKING,
          ...buildReminderCopy(booking, locale),
          href: REMINDER_HREF,
          channels: REMINDER_CHANNELS,
          dedupeKey: `booking-reminder:${booking.id}`,
        });
        if (result.deduped) {
          summary.deduped += 1;
        } else {
          summary.reminded += 1;
        }
      } catch (error) {
        summary.errors += 1;
        this.logger.warn(
          `Failed to remind booking ${booking.id} (gym ${booking.gymId}): ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return summary;
  }

  /**
   * The confirmed bookings whose occurrence starts inside `(now, windowEnd]`. Only
   * `BOOKED` seats against a `SCHEDULED` occurrence qualify — a `WAITLIST` entry
   * holds no seat, and a cancelled / attended booking or a cancelled / completed
   * occurrence is not something to remind. Cross-tenant read on the unscoped client
   * (the sweep has no request tenant context), served by the `(gymId, startsAt)`
   * index on `class_instances`.
   */
  private async findDueBookings(now: Date, windowEnd: Date): Promise<RemindableBooking[]> {
    const rows = await this.prisma.client.booking.findMany({
      where: {
        status: BookingStatus.BOOKED,
        classInstance: {
          status: InstanceStatus.SCHEDULED,
          startsAt: { gt: now, lte: windowEnd },
        },
      },
      select: {
        id: true,
        gymId: true,
        member: { select: { userId: true } },
        classInstance: {
          select: {
            startsAt: true,
            template: { select: { title: true } },
            classType: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      gymId: row.gymId,
      userId: row.member.userId,
      classTitle: row.classInstance.template?.title ?? row.classInstance.classType?.name ?? 'Class',
      startsAt: row.classInstance.startsAt,
    }));
  }

  /**
   * Resolve a gym's reminder language + timezone from its stored settings, once per
   * sweep. A gym with no (or malformed) settings falls back to the schema defaults —
   * the same complete-locale guarantee the settings API gives — so the reminder
   * always renders.
   */
  private async resolveGymLocale(
    gymId: string,
    cache: Map<string, GymReminderLocale>,
  ): Promise<GymReminderLocale> {
    const cached = cache.get(gymId);
    if (cached) return cached;

    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: { settings: true },
    });
    const settings = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    const resolved: GymReminderLocale = {
      locale: resolveEmailLocale(settings.locale.language),
      timezone: settings.locale.timezone,
    };
    cache.set(gymId, resolved);
    return resolved;
  }

  /**
   * Take the single-runner lock for this tick via Redis `SET NX EX`, keyed to the
   * minute so replicas firing the same cron tick dedupe. Returns true when this
   * instance won it. Fails **closed** on any Redis error (returns false): skipping a
   * tick is harmless — the next tick reminds every still-due booking, since due-ness
   * is a database fact, not a lock artefact — and is preferable to two replicas
   * doing the same scan at once.
   */
  private async acquireLock(): Promise<boolean> {
    const key = `booking-reminders:lock:${new Date().toISOString().slice(0, 16)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire reminder lock (Redis error) — skipping this tick: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

/** A gym's resolved reminder locale — the email/inbox copy language and the
 *  timezone the class start time is formatted in. */
interface GymReminderLocale {
  locale: EmailLocale;
  timezone: string;
}

/** The localised title + body for one booking's reminder. */
function buildReminderCopy(
  booking: RemindableBooking,
  { locale, timezone }: GymReminderLocale,
): { title: string; body: string } {
  const when = formatClassTime(booking.startsAt, timezone, locale);
  if (locale === 'ka') {
    return {
      title: 'ვარჯიშის შეხსენება',
      body: `თქვენი ვარჯიში „${booking.classTitle}" იწყება ${when}. შევხვდეთ!`,
    };
  }
  return {
    title: 'Class reminder',
    body: `Your class "${booking.classTitle}" starts ${when}. See you there!`,
  };
}

/** Format a class start instant in the gym's timezone and reminder language, e.g.
 *  `Mon, 2:30 PM` (en) — a weekday + local time, since a reminder is always for a
 *  class within the next lead window. */
function formatClassTime(startsAt: Date, timezone: string, locale: EmailLocale): string {
  const intlLocale = locale === 'ka' ? 'ka-GE' : 'en-US';
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(startsAt);
}
