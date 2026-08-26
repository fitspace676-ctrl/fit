import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  GymMemberStatus,
  GymStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ProductStatus,
  Role,
} from '@fit/db';
import { gymSettingsStoredSchema, productVariantsSchema } from '@fit/types';
import { resolveEmailLocale } from '../mail/email-locale';
import {
  EmailService,
  type DailySummary,
  type LowStockDigest,
  type LowStockDigestProduct,
} from '../auth/email.service';
import { utcDayRange } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';

/** The two ops-alert jobs this service runs, used for logging + lock keys. */
type OpsJob = 'low-stock' | 'daily-summary';

/** One recipient of an ops alert — a gym owner/manager's address + display name. */
interface OpsRecipient {
  email: string;
  name: string | null;
}

/** An ACTIVE gym as the sweep's `select` projects it. */
interface OpsGym {
  id: string;
  name: string;
  settings: Prisma.JsonValue;
}

/** The day's raw figures for one gym, before they're wrapped into a {@link DailySummary}. */
interface DailyFigures {
  revenue: number;
  orders: number;
  checkIns: number;
  newMembers: number;
  lowStockProducts: number;
}

/**
 * The outcome of one ops-alert sweep, returned by the sweep methods for logging and
 * assertion. Every ACTIVE gym is counted in `gymsProcessed`; `gymsWithRecipients`
 * are the ones with at least one eligible owner/manager, and `gymsReported` the
 * subset that actually had something to send (low stock present / a non-quiet day).
 * `emailsSkipped` are sends that no-op'd because Resend is unconfigured,
 * `emailsFailed` sends Resend rejected.
 */
export interface OpsDeliverySummary {
  job: OpsJob;
  gymsProcessed: number;
  gymsWithRecipients: number;
  gymsReported: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsFailed: number;
}

/** Cron: low-stock digest — daily 08:00 (server time), a morning reorder nudge. */
const LOW_STOCK_CRON = '0 8 * * *';
/** Cron: end-of-day summary — daily 22:00 (server time), late enough to recap the day. */
const DAILY_SUMMARY_CRON = '0 22 * * *';

/** How long the per-job Redis lock is held — long enough to dedupe replicas firing
 *  at the same minute, short enough to expire well before the next daily window. */
const LOCK_TTL_SECONDS = 3_600;

/**
 * Ops notifications (T8.8).
 *
 * Owner/manager operational alerts, delivered as two scheduled emails to every gym's
 * OWNER / MANAGER staff:
 *   • a **low-stock digest** — the products carrying at least one variant at or below
 *     the reorder threshold ({@link env.OPS_LOW_STOCK_THRESHOLD}), so staff restock
 *     before a line sells out; and
 *   • an **end-of-day summary** — the day's takings, paid orders, check-ins and new
 *     members for the gym's local business day.
 *
 * Both sweeps are deliberately **cross-tenant**: they read the gym roster and each
 * gym's staff through the unscoped {@link PrismaService} with an explicit `gymId` (a
 * cron has no request tenant context), the same shape {@link ReportDeliveryService}
 * (T4.10) established. Delivery reuses the {@link EmailService} — a gym with no
 * eligible recipients, no low stock, or a completely quiet day is skipped rather than
 * mailed, so the alerts stay signal.
 *
 * Scheduling is gated three ways so it is safe in every environment:
 *   • the job's feature flag (`OPS_LOW_STOCK_DIGEST_ENABLED` / `OPS_DAILY_SUMMARY_ENABLED`)
 *     must be true — off in dev / CI / preview by default;
 *   • Resend must be configured (nothing to send otherwise); and
 *   • a Redis `SET NX` lock per job + day means a multi-instance deployment sends each
 *     digest exactly once even though every replica runs the cron.
 */
@Injectable()
export class OpsNotificationsService {
  private readonly logger = new Logger(OpsNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  /** Low-stock digest cron entry point (daily 08:00). */
  @Cron(LOW_STOCK_CRON, { name: 'ops-low-stock-digest' })
  async runLowStockDigest(): Promise<void> {
    await this.runScheduled('low-stock', env.OPS_LOW_STOCK_DIGEST_ENABLED, () =>
      this.sweepLowStock(),
    );
  }

  /** End-of-day summary cron entry point (daily 22:00). */
  @Cron(DAILY_SUMMARY_CRON, { name: 'ops-daily-summary' })
  async runDailySummary(): Promise<void> {
    await this.runScheduled('daily-summary', env.OPS_DAILY_SUMMARY_ENABLED, () =>
      this.sweepDailySummary(),
    );
  }

  /**
   * The scheduled wrapper the cron handlers share: honour the job's feature flag,
   * ensure mail can actually be sent, take the single-sender Redis lock, then run the
   * sweep. Any of the three gates short-circuits with a log line rather than sending.
   * Kept separate from the sweeps so those stay plain, unit-testable methods with no
   * scheduling side effects.
   */
  private async runScheduled(
    job: OpsJob,
    enabled: boolean,
    sweep: () => Promise<OpsDeliverySummary>,
  ): Promise<void> {
    if (!enabled) {
      this.logger.debug(`Ops ${job} disabled (feature flag unset) — skipping`);
      return;
    }
    if (!this.email.isConfigured) {
      this.logger.warn(`Resend not configured — skipping ops ${job} sweep`);
      return;
    }
    if (!(await this.acquireLock(job))) {
      this.logger.debug(`Another instance holds the ops ${job} lock — skipping`);
      return;
    }

    this.logger.log(`Running ops ${job} sweep`);
    try {
      const summary = await sweep();
      this.logger.log(
        `Ops ${job}: ${summary.emailsSent} sent, ${summary.emailsSkipped} skipped, ` +
          `${summary.emailsFailed} failed across ${summary.gymsReported}/${summary.gymsProcessed} gyms`,
      );
    } catch (error) {
      this.logger.error(
        `Ops ${job} sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Email every ACTIVE gym's owners/managers its low-stock digest. A gym with no
   * eligible recipients, or no product at or below the threshold, is skipped without
   * a mail. `now` is unused here (the roster is a live read) but kept in the sweep
   * signature for symmetry with {@link sweepDailySummary}.
   */
  async sweepLowStock(options?: { now?: Date }): Promise<OpsDeliverySummary> {
    const now = options?.now ?? new Date();
    const threshold = env.OPS_LOW_STOCK_THRESHOLD;
    const productsUrl = buildAdminUrl('products');

    return this.runGymSweep(
      'low-stock',
      async (gym): Promise<LowStockDigest | null> => {
        const products = await this.lowStockProductsFor(gym.id, threshold);
        if (products.length === 0) {
          return null;
        }
        const { language } = gymSettingsStoredSchema.parse(gym.settings ?? {}).locale;
        return {
          gymName: gym.name,
          threshold,
          products,
          productsUrl,
          locale: resolveEmailLocale(language),
        };
      },
      (email, digest) => this.email.sendLowStockDigestEmail(email, digest),
      now,
    );
  }

  /**
   * Email every ACTIVE gym's owners/managers its end-of-day summary for the gym's
   * local business day that `now` falls in. A gym with no eligible recipients, or a
   * completely quiet day (no revenue, orders, check-ins or new members), is skipped
   * without a mail. `now` is injectable for deterministic tests.
   */
  async sweepDailySummary(options?: { now?: Date }): Promise<OpsDeliverySummary> {
    const now = options?.now ?? new Date();
    const dashboardUrl = buildAdminUrl('dashboard');
    const threshold = env.OPS_LOW_STOCK_THRESHOLD;

    return this.runGymSweep(
      'daily-summary',
      async (gym): Promise<DailySummary | null> => {
        const settings = gymSettingsStoredSchema.parse(gym.settings ?? {});
        const { timezone, currency, language } = settings.locale;
        const date = zonedDateString(now, timezone);
        const { gte, lt } = utcDayRange(date, timezone);

        const figures = await this.dailyFiguresFor(gym.id, gte, lt, threshold);
        if (isQuietDay(figures)) {
          return null;
        }
        return {
          gymName: gym.name,
          date,
          currency,
          dashboardUrl,
          locale: resolveEmailLocale(language),
          ...figures,
        };
      },
      (email, summary) => this.email.sendDailySummaryEmail(email, summary),
      now,
    );
  }

  /**
   * The shared cross-tenant scaffolding both sweeps run on: enumerate ACTIVE gyms,
   * resolve each gym's owner/manager recipients, `build` a per-gym payload (returning
   * `null` to skip a gym with nothing to report), then `send` it to each recipient —
   * tallying sent / skipped / failed. Each gym is processed independently: a build or
   * send that throws is logged and counted without aborting the rest of the sweep.
   */
  private async runGymSweep<TPayload>(
    job: OpsJob,
    build: (gym: OpsGym, now: Date) => Promise<TPayload | null>,
    send: (email: string, payload: TPayload) => Promise<boolean>,
    now: Date,
  ): Promise<OpsDeliverySummary> {
    const gyms = await this.prisma.client.gym.findMany({
      where: { status: GymStatus.ACTIVE },
      select: { id: true, name: true, settings: true },
      orderBy: { createdAt: 'asc' },
    });

    const summary: OpsDeliverySummary = {
      job,
      gymsProcessed: 0,
      gymsWithRecipients: 0,
      gymsReported: 0,
      emailsSent: 0,
      emailsSkipped: 0,
      emailsFailed: 0,
    };

    for (const gym of gyms) {
      summary.gymsProcessed += 1;
      const recipients = await this.recipientsFor(gym.id);
      if (recipients.length === 0) {
        continue;
      }
      summary.gymsWithRecipients += 1;

      let payload: TPayload | null;
      try {
        payload = await build(gym, now);
      } catch (error) {
        this.logger.warn(
          `Failed to build ops ${job} for gym ${gym.id}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (payload === null) {
        continue;
      }
      summary.gymsReported += 1;

      for (const recipient of recipients) {
        try {
          const sent = await send(recipient.email, payload);
          if (sent) {
            summary.emailsSent += 1;
          } else {
            summary.emailsSkipped += 1;
          }
        } catch (error) {
          summary.emailsFailed += 1;
          this.logger.warn(
            `Failed to send ops ${job} to ${recipient.email} for gym ${gym.id}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return summary;
  }

  /**
   * The eligible ops-alert recipients for one gym: its ACTIVE OWNER / MANAGER staff
   * whose email is verified (an unverified address is one we must not mail).
   * Cross-tenant read with an explicit `gymId` on the unscoped client. Deduped by
   * address defensively (a user could hold two eligible roles). Mirrors
   * {@link ReportDeliveryService.recipientsFor}.
   */
  private async recipientsFor(gymId: string): Promise<OpsRecipient[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: {
        gymId,
        role: { in: [Role.OWNER, Role.MANAGER] },
        status: GymMemberStatus.ACTIVE,
        user: { emailVerifiedAt: { not: null } },
      },
      select: { user: { select: { email: true, name: true } } },
    });

    const byEmail = new Map<string, OpsRecipient>();
    for (const member of members) {
      if (!byEmail.has(member.user.email)) {
        byEmail.set(member.user.email, { email: member.user.email, name: member.user.name });
      }
    }
    return [...byEmail.values()];
  }

  /**
   * The ACTIVE products for one gym carrying at least one variant at or below
   * `threshold`, most-urgent product first (lowest on-hand count leads). Stock lives
   * per-variant inside the product's `variants` JSON, so the threshold filter runs in
   * memory — the same scan the console's low-stock report (T7.8) uses, on the unscoped
   * client with an explicit `gymId`. A product with no variants is untracked and never
   * surfaces.
   */
  private async lowStockProductsFor(
    gymId: string,
    threshold: number,
  ): Promise<LowStockDigestProduct[]> {
    const rows = await this.prisma.client.product.findMany({
      where: { gymId, status: ProductStatus.ACTIVE },
      select: { name: true, variants: true },
      orderBy: { createdAt: 'asc' },
    });

    const products: LowStockDigestProduct[] = [];
    for (const row of rows) {
      const parsed = productVariantsSchema.safeParse(row.variants ?? []);
      const variants = parsed.success ? parsed.data : [];
      const low = variants
        .map((variant, index) => ({
          label: variantLabel(variant.name, variant.sku, index),
          stock: variant.stock,
        }))
        .filter((variant) => variant.stock <= threshold);
      if (low.length === 0) {
        continue;
      }
      products.push({
        name: row.name,
        variants: low,
        lowestStock: Math.min(...low.map((variant) => variant.stock)),
      });
    }

    products.sort((a, b) => a.lowestStock - b.lowestStock);
    return products;
  }

  /**
   * One gym's figures for the `[gte, lt)` day window: captured revenue (minor units),
   * paid-order count, check-in count, new-member count, and the current number of
   * low-stock products (a live nudge, not window-bound). All on the unscoped client
   * with an explicit `gymId`, gathered in one round trip.
   */
  private async dailyFiguresFor(
    gymId: string,
    gte: Date,
    lt: Date,
    threshold: number,
  ): Promise<DailyFigures> {
    const [revenue, orders, checkIns, newMembers, lowStock] = await Promise.all([
      this.prisma.client.payment.aggregate({
        where: { gymId, status: PaymentStatus.CAPTURED, createdAt: { gte, lt } },
        _sum: { amount: true },
      }),
      this.prisma.client.order.count({
        where: { gymId, status: OrderStatus.PAID, createdAt: { gte, lt } },
      }),
      this.prisma.client.checkIn.count({
        where: { gymId, checkedInAt: { gte, lt } },
      }),
      this.prisma.client.gymMember.count({
        where: { gymId, role: Role.MEMBER, joinedAt: { gte, lt } },
      }),
      this.lowStockProductsFor(gymId, threshold),
    ]);

    return {
      revenue: revenue._sum.amount ?? 0,
      orders,
      checkIns,
      newMembers,
      lowStockProducts: lowStock.length,
    };
  }

  /**
   * Take the single-sender lock for this job's daily window via Redis `SET NX EX`,
   * keyed by job + calendar day so it naturally scopes to one run. Returns true when
   * this instance won the lock. Fails **closed** on any Redis error (returns false): a
   * missed low-value digest is preferable to every replica sending a duplicate storm
   * when the lock backend is unavailable.
   */
  private async acquireLock(job: OpsJob): Promise<boolean> {
    const key = `ops:lock:${job}:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire ops ${job} lock (Redis error) — skipping to avoid duplicates: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

/** A quiet day has nothing worth mailing a summary about — no takings, orders,
 *  check-ins, or new members. Low stock alone is the low-stock digest's job. */
function isQuietDay(figures: DailyFigures): boolean {
  return (
    figures.revenue === 0 &&
    figures.orders === 0 &&
    figures.checkIns === 0 &&
    figures.newMembers === 0
  );
}

/** A human label for a low-stock variant: its name, else its SKU, else its 1-based
 *  position (variants have no id of their own). */
function variantLabel(name: string, sku: string, index: number): string {
  return name.trim() || sku.trim() || `Variant ${index + 1}`;
}

/** The gym-local calendar date (`YYYY-MM-DD`) the instant falls in, in `timeZone` —
 *  `en-CA` renders an ISO-ordered date, so no manual assembly. */
function zonedDateString(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * A console deep link for the alert's CTA — built from `ADMIN_URL` + `path` when set,
 * otherwise undefined (the email simply renders no link), mirroring T4.10's
 * `buildReportsUrl`.
 */
function buildAdminUrl(path: string): string | undefined {
  return env.ADMIN_URL ? `${env.ADMIN_URL.replace(/\/+$/, '')}/${path}` : undefined;
}
