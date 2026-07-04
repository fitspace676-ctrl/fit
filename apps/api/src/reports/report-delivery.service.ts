import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GymMemberStatus, GymStatus, Role } from '@fit/db';
import {
  REPORT_DIGEST_KEYS,
  REPORT_DIGEST_RANGE,
  type ReportDigest,
  type ReportDigestCadence,
  type ReportDigestSection,
} from '@fit/types';
import { EmailService } from '../auth/email.service';
import { tenantStorage } from '../common/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import { ReportsService } from './reports.service';

/** One recipient of a gym's digest — a staff member's address + display name. */
interface DigestRecipient {
  email: string;
  name: string | null;
}

/**
 * The outcome of one cadence sweep, returned by {@link ReportDeliveryService.deliverAll}
 * for logging and assertion. Every gym is counted; `emailsSkipped` are sends that
 * no-op'd because Resend is unconfigured, `emailsFailed` are sends Resend rejected.
 */
export interface ReportDeliverySummary {
  cadence: ReportDigestCadence;
  gymsProcessed: number;
  gymsWithRecipients: number;
  emailsSent: number;
  emailsSkipped: number;
  emailsFailed: number;
}

/** Cron: weekly digest — Monday 07:00 (server time). */
const WEEKLY_CRON = '0 7 * * 1';
/** Cron: monthly digest — the 1st at 07:00 (server time). */
const MONTHLY_CRON = '0 7 1 * *';

/** How long the per-cadence Redis lock is held — long enough to dedupe replicas
 *  firing at the same minute, short enough to expire well before the next window. */
const LOCK_TTL_SECONDS = 3_600;

/**
 * Scheduled operational report delivery (T4.10).
 *
 * Emails every gym's OWNER / MANAGER a weekly and monthly digest of the same
 * operational reports the console's Reports screen shows (T4.8) — revenue by
 * channel, attendance, membership growth, no-show rate — so the people running a
 * gym get the numbers pushed to them instead of having to open the console.
 *
 * The sweep is deliberately **cross-tenant**: it reads the gym roster and each
 * gym's staff through the unscoped {@link PrismaService} (with an explicit
 * `gymId`), then computes each gym's reports by running the tenant-scoped
 * {@link ReportsService} inside a {@link tenantStorage} context pinned to that
 * gym — so the report math (and its tenant isolation) is the exact same code the
 * live API serves, with no windowing or scoping duplicated here.
 *
 * Scheduling is gated two ways so it is safe in every environment:
 *   • `REPORT_DIGEST_ENABLED` must be true (off in dev / CI / preview by default).
 *   • a Redis `SET NX` lock per cadence window means a multi-instance deployment
 *     sends each digest exactly once even though every replica runs the cron.
 * When Resend is unconfigured the whole sweep is skipped (there is nothing to
 * send), mirroring how the other transactional mails degrade.
 */
@Injectable()
export class ReportDeliveryService {
  private readonly logger = new Logger(ReportDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  /** Weekly digest cron entry point (Monday 07:00). */
  @Cron(WEEKLY_CRON, { name: 'weekly-report-digest' })
  async runWeekly(): Promise<void> {
    await this.runScheduled('weekly');
  }

  /** Monthly digest cron entry point (1st of the month, 07:00). */
  @Cron(MONTHLY_CRON, { name: 'monthly-report-digest' })
  async runMonthly(): Promise<void> {
    await this.runScheduled('monthly');
  }

  /**
   * The scheduled wrapper the cron handlers call: honour the feature flag, ensure
   * mail can actually be sent, take the single-sender Redis lock, then run the
   * sweep. Any of the three gates short-circuits with a log line rather than
   * sending. Kept separate from {@link deliverAll} so the sweep itself stays a
   * plain, unit-testable method with no scheduling side effects.
   */
  private async runScheduled(cadence: ReportDigestCadence): Promise<void> {
    if (!env.REPORT_DIGEST_ENABLED) {
      this.logger.debug(
        `Report digest disabled (REPORT_DIGEST_ENABLED unset) — skipping ${cadence}`,
      );
      return;
    }
    if (!this.email.isConfigured) {
      this.logger.warn(`Resend not configured — skipping ${cadence} report digest`);
      return;
    }
    if (!(await this.acquireLock(cadence))) {
      this.logger.debug(`Another instance holds the ${cadence} digest lock — skipping`);
      return;
    }

    this.logger.log(`Running ${cadence} report digest`);
    try {
      const summary = await this.deliverAll(cadence);
      this.logger.log(
        `${cadence} report digest: ${summary.emailsSent} sent, ${summary.emailsSkipped} skipped, ` +
          `${summary.emailsFailed} failed across ${summary.gymsWithRecipients}/${summary.gymsProcessed} gyms`,
      );
    } catch (error) {
      this.logger.error(
        `${cadence} report digest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Compute and send the digest to every ACTIVE gym's owners/managers. Each gym is
   * processed independently: a gym with no eligible recipients is counted and
   * skipped, and a send that throws (Resend error) is tallied without aborting the
   * rest of the sweep, so one gym's failure never blocks another's digest.
   */
  async deliverAll(cadence: ReportDigestCadence): Promise<ReportDeliverySummary> {
    const gyms = await this.prisma.client.gym.findMany({
      where: { status: GymStatus.ACTIVE },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    const summary: ReportDeliverySummary = {
      cadence,
      gymsProcessed: 0,
      gymsWithRecipients: 0,
      emailsSent: 0,
      emailsSkipped: 0,
      emailsFailed: 0,
    };
    const reportsUrl = buildReportsUrl();

    for (const gym of gyms) {
      summary.gymsProcessed += 1;
      const recipients = await this.recipientsFor(gym.id);
      if (recipients.length === 0) {
        continue;
      }
      summary.gymsWithRecipients += 1;

      const digest = await this.buildDigest(gym.id, gym.name, cadence);

      for (const recipient of recipients) {
        try {
          const sent = await this.email.sendReportDigestEmail(recipient.email, digest, {
            reportsUrl,
          });
          if (sent) {
            summary.emailsSent += 1;
          } else {
            summary.emailsSkipped += 1;
          }
        } catch (error) {
          summary.emailsFailed += 1;
          this.logger.warn(
            `Failed to send ${cadence} digest to ${recipient.email} for gym ${gym.id}: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return summary;
  }

  /**
   * The eligible digest recipients for one gym: its ACTIVE OWNER / MANAGER staff
   * whose email is verified (an unverified address is one we must not mail).
   * Cross-tenant read with an explicit `gymId` on the unscoped client — the sweep
   * has no request tenant context. Deduped by address defensively.
   */
  private async recipientsFor(gymId: string): Promise<DigestRecipient[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: {
        gymId,
        role: { in: [Role.OWNER, Role.MANAGER] },
        status: GymMemberStatus.ACTIVE,
        user: { emailVerifiedAt: { not: null } },
      },
      select: { user: { select: { email: true, name: true } } },
    });

    const byEmail = new Map<string, DigestRecipient>();
    for (const member of members) {
      if (!byEmail.has(member.user.email)) {
        byEmail.set(member.user.email, { email: member.user.email, name: member.user.name });
      }
    }
    return [...byEmail.values()];
  }

  /**
   * Compute one gym's digest by running each included report through the
   * tenant-scoped {@link ReportsService} inside a {@link tenantStorage} context
   * pinned to this gym — so the reports are the same tenant-isolated aggregates the
   * live `/admin/reports` API serves for the cadence's range.
   */
  private async buildDigest(
    gymId: string,
    gymName: string,
    cadence: ReportDigestCadence,
  ): Promise<ReportDigest> {
    const range = REPORT_DIGEST_RANGE[cadence];
    const sections = await tenantStorage.run(
      { userId: null, gymId, role: Role.OWNER, allowCrossTenant: false },
      async () => {
        const results: ReportDigestSection[] = [];
        for (const key of REPORT_DIGEST_KEYS) {
          results.push(await this.reports.runReport(key, { range }));
        }
        return results;
      },
    );

    return { gymName, cadence, range, sections };
  }

  /**
   * Take the single-sender lock for this cadence's window via Redis `SET NX EX`,
   * keyed by cadence + the calendar day so it naturally scopes to one run. Returns
   * true when this instance won the lock. Fails **closed** on any Redis error
   * (returns false): a missed low-value digest is preferable to every replica
   * sending a duplicate storm when the lock backend is unavailable.
   */
  private async acquireLock(cadence: ReportDigestCadence): Promise<boolean> {
    const key = `report-digest:lock:${cadence}:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire ${cadence} digest lock (Redis error) — skipping to avoid duplicates: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

/**
 * The admin console's Reports screen URL, for the "View full reports" link — built
 * from `ADMIN_URL` when set, otherwise omitted (the email simply renders no link).
 */
function buildReportsUrl(): string | undefined {
  return env.ADMIN_URL ? `${env.ADMIN_URL.replace(/\/+$/, '')}/reports` : undefined;
}
