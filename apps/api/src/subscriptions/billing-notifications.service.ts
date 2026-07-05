import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory, NotificationChannel, SubscriptionStatus } from '@fit/db';
import { gymSettingsStoredSchema } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { resolveEmailLocale, type EmailLocale } from '../notifications/notification-email';

/** In-app deep link every billing notification routes to — the member portal's
 *  membership screen, where they can see their plan and update payment. */
const MEMBERSHIP_HREF = '/account/membership';

/**
 * The channels a billing notification is offered on: the member's inbox plus their
 * email and push. This is the *requested* set — {@link NotificationService.send}
 * subtracts each member's per-channel opt-outs for the BILLING category, so a member
 * who muted push (or email) still gets the ones they left on ("preferred channels").
 */
const BILLING_CHANNELS: readonly NotificationChannel[] = [
  NotificationChannel.IN_APP,
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
];

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/** The billing facts about one subscription a notification is built from. */
export interface BillingSubscriptionRef {
  /** The subscription the event concerns — keys the dedupe. */
  id: string;
  /** The gym (recipient's tenant) — addresses the send and resolves copy locale. */
  gymId: string;
  /** The recipient user id (the member's `GymMember.userId`). */
  userId: string;
  /** The charge amount in the currency's minor units (cents/tetri). */
  priceAmount: number;
  /** ISO-4217 currency the amount is in. */
  currency: string;
}

/** The outcome of one trial-ending sweep, for logging and assertion. */
export interface TrialEndingSweepSummary {
  /** How many TRIAL subscriptions fell inside the lead window this run. */
  matched: number;
  /** Heads-ups freshly delivered (not previously sent for this trial end). */
  notified: number;
  /** Skipped because a heads-up had already been sent (dedupe backstop). */
  deduped: number;
  /** Left un-notified by a per-subscription failure. */
  errors: number;
}

/**
 * Billing notifications (T8.7) — the seam the recurring-billing job (T5.4) calls to
 * keep a member informed about their subscription's money events, layered over the
 * {@link NotificationService} dispatch pipeline (T8.1).
 *
 * Three lifecycle moments produce a BILLING-category notification, fanned out over
 * the member's inbox, email, and push minus the channels they have muted:
 *   • {@link renewalSucceeded} — a renewal charge settled (or a free trial just
 *     converted to a paid membership), emitted from the billing sweep's advance path.
 *   • {@link chargeFailed} — a renewal charge was declined, emitted from the dunning
 *     ladder each time a rung fails so the member knows to fix their payment method.
 *   • {@link notifyTrialsEndingSoon} — a heads-up a few days *before* a free trial
 *     converts, its own small sweep over trials ending within the lead window.
 *
 * Every send is **best-effort**: a transport failure is caught and logged, never
 * rethrown, because the money has already moved — a notification hiccup must not
 * fail (or be mistaken for) the billing transition that triggered it. At-most-once
 * delivery is the dispatch layer's `(userId, dedupeKey)` unique index: the renewal
 * key is scoped to the new period, the failure key to the exact ladder rung, and the
 * trial heads-up to the trial end, so a re-run or overlapping replica never doubles a
 * message.
 *
 * Runs on the **unscoped** {@link PrismaService} and is addressed by explicit
 * `(gymId, userId)`, like the job that calls it — no ambient request tenant scope.
 */
@Injectable()
export class BillingNotificationsService {
  private readonly logger = new Logger(BillingNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Notify a member that their renewal charge settled — or, when `wasTrial`, that
   * their free trial just converted to a paid membership. Keyed to the new period so
   * the same renewal is announced at most once.
   */
  async renewalSucceeded(
    sub: BillingSubscriptionRef,
    opts: { nextPeriodEnd: Date; wasTrial: boolean },
  ): Promise<void> {
    const locale = await this.resolveGymLocale(sub.gymId);
    const amount = formatMoney(sub.priceAmount, sub.currency, locale);
    const nextDate = formatDate(opts.nextPeriodEnd, locale);
    const copy = opts.wasTrial
      ? trialConvertedCopy(locale, amount, nextDate)
      : renewalCopy(locale, amount, nextDate);
    await this.deliver(sub, copy, `billing-renewal:${sub.id}:${opts.nextPeriodEnd.toISOString()}`);
  }

  /**
   * Notify a member that a renewal charge failed, so they can update their payment
   * method before the dunning ladder expires their membership. Keyed to the exact
   * ladder rung (`rung`) so each distinct retry warns once but a re-run of the same
   * rung does not.
   */
  async chargeFailed(
    sub: BillingSubscriptionRef,
    opts: { rung: number; periodEnd: Date },
  ): Promise<void> {
    const locale = await this.resolveGymLocale(sub.gymId);
    const amount = formatMoney(sub.priceAmount, sub.currency, locale);
    await this.deliver(
      sub,
      chargeFailedCopy(locale, amount),
      `billing-failed:${sub.id}:${opts.periodEnd.toISOString()}:r${opts.rung}`,
    );
  }

  /**
   * Warn every member whose free trial converts within the lead window that their
   * first charge is coming. Its own small cross-tenant sweep over `TRIAL`
   * subscriptions due to convert in `(now, now + leadDays]` — skipping any the member
   * cancelled during the trial (they will be charged nothing) — keyed to the trial
   * end so a member is warned once per trial even as the window slides across runs.
   */
  async notifyTrialsEndingSoon(now: Date, leadDays: number): Promise<TrialEndingSweepSummary> {
    const windowEnd = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000);
    const trials = await this.prisma.client.subscription.findMany({
      where: {
        status: SubscriptionStatus.TRIAL,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { gt: now, lte: windowEnd },
      },
      select: {
        id: true,
        gymId: true,
        priceAmount: true,
        currency: true,
        currentPeriodEnd: true,
        member: { select: { userId: true } },
      },
      orderBy: { currentPeriodEnd: 'asc' },
    });

    const summary: TrialEndingSweepSummary = {
      matched: trials.length,
      notified: 0,
      deduped: 0,
      errors: 0,
    };

    for (const trial of trials) {
      try {
        const locale = await this.resolveGymLocale(trial.gymId);
        const amount = formatMoney(trial.priceAmount, trial.currency, locale);
        const when = formatDate(trial.currentPeriodEnd, locale);
        const result = await this.notifications.send({
          gymId: trial.gymId,
          userId: trial.member.userId,
          category: NotificationCategory.BILLING,
          ...trialEndingCopy(locale, amount, when),
          href: MEMBERSHIP_HREF,
          channels: BILLING_CHANNELS,
          dedupeKey: `trial-ending:${trial.id}:${trial.currentPeriodEnd.toISOString()}`,
        });
        if (result.deduped) summary.deduped += 1;
        else summary.notified += 1;
      } catch (error) {
        summary.errors += 1;
        this.logger.warn(
          `Failed to warn trial ${trial.id} (gym ${trial.gymId}) of its ending: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return summary;
  }

  /**
   * Send one billing notification, swallowing any transport error. The caller is a
   * post-charge success path — the money has already moved — so a failed notification
   * is logged and dropped, never propagated back into the billing transition.
   */
  private async deliver(
    sub: BillingSubscriptionRef,
    copy: { title: string; body: string },
    dedupeKey: string,
  ): Promise<void> {
    try {
      await this.notifications.send({
        gymId: sub.gymId,
        userId: sub.userId,
        category: NotificationCategory.BILLING,
        ...copy,
        href: MEMBERSHIP_HREF,
        channels: BILLING_CHANNELS,
        dedupeKey,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send billing notification for subscription ${sub.id} (gym ${sub.gymId}): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolve a gym's notification language from its stored settings. A gym with no (or
   * malformed) settings falls back to the schema defaults — the same complete-locale
   * guarantee the settings API gives — so the copy always renders.
   */
  private async resolveGymLocale(gymId: string): Promise<EmailLocale> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: gymId },
      select: { settings: true },
    });
    const settings = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    return resolveEmailLocale(settings.locale.language);
  }
}

/** Format a minor-unit amount as a locale-aware currency string (e.g. `$50.00`).
 *  Falls back to `50.00 USD` for a currency `Intl` doesn't recognise so the copy
 *  always renders a number. */
function formatMoney(amountMinor: number, currency: string, locale: EmailLocale): string {
  const major = amountMinor / MINOR_PER_MAJOR;
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/** Format a date as a locale-aware medium date (e.g. `Jul 1, 2026`). */
function formatDate(date: Date, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium' }).format(date);
}

/** The BCP-47 tag the platform locale maps to for `Intl`. */
function intlLocale(locale: EmailLocale): string {
  return locale === 'ka' ? 'ka-GE' : 'en-US';
}

/** Copy for a settled renewal charge. */
function renewalCopy(
  locale: EmailLocale,
  amount: string,
  nextDate: string,
): { title: string; body: string } {
  if (locale === 'ka') {
    return {
      title: 'გაწევრიანება განახლდა',
      body: `თქვენი გაწევრიანება განახლდა — ${amount}. შემდეგი გადახდა: ${nextDate}.`,
    };
  }
  return {
    title: 'Membership renewed',
    body: `Your membership renewed for ${amount}. Your next payment is on ${nextDate}.`,
  };
}

/** Copy for a free trial that just converted to a paid membership. */
function trialConvertedCopy(
  locale: EmailLocale,
  amount: string,
  nextDate: string,
): { title: string; body: string } {
  if (locale === 'ka') {
    return {
      title: 'საცდელი პერიოდი დასრულდა',
      body:
        `თქვენი უფასო საცდელი პერიოდი დასრულდა და გაწევრიანება გააქტიურდა. ` +
        `ჩამოგეჭრათ ${amount}; შემდეგი გადახდა: ${nextDate}.`,
    };
  }
  return {
    title: 'Your membership is now active',
    body:
      `Your free trial has ended and your membership is now active. ` +
      `You were charged ${amount}; your next payment is on ${nextDate}.`,
  };
}

/** Copy for a declined renewal charge. */
function chargeFailedCopy(locale: EmailLocale, amount: string): { title: string; body: string } {
  if (locale === 'ka') {
    return {
      title: 'გადახდა ვერ განხორციელდა',
      body:
        `ვერ დავამუშავეთ თქვენი ${amount} გადახდა. ` +
        `გთხოვთ განაახლოთ გადახდის მეთოდი, რომ გაწევრიანება აქტიური დარჩეს.`,
    };
  }
  return {
    title: 'Payment failed',
    body:
      `We couldn't process your ${amount} membership payment. ` +
      `Please update your payment method to keep your membership active.`,
  };
}

/** Copy for a trial-ending heads-up ahead of the first charge. */
function trialEndingCopy(
  locale: EmailLocale,
  amount: string,
  when: string,
): { title: string; body: string } {
  if (locale === 'ka') {
    return {
      title: 'საცდელი პერიოდი მთავრდება',
      body: `თქვენი უფასო საცდელი პერიოდი მთავრდება ${when}. გაგრძელებისთვის ჩამოგეჭრებათ ${amount}.`,
    };
  }
  return {
    title: 'Your trial is ending',
    body: `Your free trial ends on ${when}. You'll be charged ${amount} to continue your membership.`,
  };
}
