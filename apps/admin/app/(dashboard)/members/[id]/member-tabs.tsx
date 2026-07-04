'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  MAX_FREEZE_DURATION_DAYS,
  type CreditPackCatalogueEntry,
  type CreditPackSummary,
  type MemberActivity,
  type MemberActivityKind,
  type MemberCurrentPlan,
  type MemberDetail,
} from '@fit/types';
import {
  Btn,
  buttonClasses,
  Card,
  Field,
  Icon,
  Input,
  Modal,
  Progress,
  useToast,
  type IconName,
} from '@/components/ui';
import {
  freezeMemberSubscriptionAction,
  grantMemberCreditPackAction,
  unfreezeMemberSubscriptionAction,
} from '../actions';

/** Translator for the `admin.members` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The detail page's tab keys, matching the Planflow "formacore" reference order; labels come from `memberTabs.<key>`. */
const TABS = ['overview', 'subscriptions', 'bookings', 'payments', 'invoices', 'notes'] as const;
type Tab = (typeof TABS)[number];

/** Shared list-row surface, matching the formacore card treatment. */
const ROW_CLASS =
  'flex items-center justify-between rounded-card border border-ink-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.035]';

/** Icon + tint per activity kind. */
const ACTIVITY_ICON: Record<MemberActivityKind, IconName> = {
  checkin: 'check',
  booking: 'calendar',
  payment: 'card',
  milestone: 'star',
};

/** Format minor currency units as a Georgian Lari amount. */
function formatAmount(minorUnits: number, currency: string): string {
  const symbol = currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format an ISO instant as a short local date. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format an ISO instant as a short local date-time. */
function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

/** A centered empty-state line shown when a tab has no records yet. */
function EmptyState({ children }: { children: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon name="info" className="h-7 w-7 text-ink-300 dark:text-ink-500" />
      <p className="text-sm text-ink-500 dark:text-ink-400">{children}</p>
    </Card>
  );
}

/**
 * The member detail page's tabbed history (Overview / Subscriptions / Bookings /
 * Payments / Notes). The data is fetched server-side and passed in; this component
 * owns only the active-tab selection. Every populated surface is a real,
 * tenant-scoped fact; empty collections render honest empty states. Tags + notes
 * have no backing model, so they show a disabled affordance / "No notes yet".
 */
export function MemberTabs({
  member,
  canManageBilling,
  creditPacks,
  creditCatalogue,
}: {
  member: MemberDetail;
  canManageBilling: boolean;
  creditPacks: CreditPackSummary[];
  creditCatalogue: CreditPackCatalogueEntry[];
}) {
  const t = useTranslations('admin.members');
  const locale = useLocale();
  const [active, setActive] = useState<Tab>('overview');

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10"
      >
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
              }`}
            >
              {t(`memberTabs.${tab}`)}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {active === 'overview' && (
          <OverviewPanel
            member={member}
            canManageBilling={canManageBilling}
            creditPacks={creditPacks}
            creditCatalogue={creditCatalogue}
            t={t}
            locale={locale}
          />
        )}

        {active === 'subscriptions' &&
          (member.subscriptions.length === 0 ? (
            <EmptyState>{t('detail.noSubscriptions')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.subscriptions.map((sub) => (
                <li key={sub.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{sub.planName}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {t('detail.subStarted', { date: formatDate(sub.startedAt, locale) })}
                      {sub.renewsAt
                        ? t('detail.subRenews', { date: formatDate(sub.renewsAt, locale) })
                        : ''}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {sub.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'bookings' &&
          (member.bookings.length === 0 ? (
            <EmptyState>{t('detail.noBookings')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.bookings.map((booking) => (
                <li key={booking.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{booking.title}</p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatDateTime(booking.startsAt, locale)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {booking.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'payments' &&
          (member.payments.length === 0 ? (
            <EmptyState>{t('detail.noPayments')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.payments.map((payment) => (
                <li key={payment.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-mono font-medium tabular-nums text-ink-900 dark:text-white">
                      {formatAmount(payment.amount, member.currency)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatDate(payment.paidAt, locale)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                    {payment.status}
                  </span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'invoices' &&
          (member.invoices.length === 0 ? (
            <EmptyState>{t('detail.noInvoices')}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.invoices.map((invoice) => (
                <li key={invoice.id} className={ROW_CLASS}>
                  <div>
                    <p className="font-mono font-medium tabular-nums text-ink-900 dark:text-white">
                      {invoice.number} · {formatAmount(invoice.amount, invoice.currency)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatDate(invoice.issuedAt, locale)} · {invoice.status}
                    </p>
                  </div>
                  {/* Download proxy is a root-relative admin route handler, not a data
                      action — a plain <a> so the browser handles the file download. */}
                  <a
                    href={`/invoices/${invoice.id}/pdf`}
                    className={buttonClasses('outline', 'sm')}
                    aria-label={t('detail.downloadInvoice')}
                  >
                    <Icon name="download" className="h-4 w-4" /> {t('detail.download')}
                  </a>
                </li>
              ))}
            </ul>
          ))}

        {active === 'notes' && <EmptyState>{t('detail.noNotes')}</EmptyState>}
      </div>
    </div>
  );
}

/**
 * Overview — the "Recent activity" timeline + an "Attendance · last 8 weeks" bar
 * chart, with a side column carrying the "Current plan" panel and "Tags". The
 * timeline / attendance / plan are all real; Tags is an honest empty state (no
 * backing model) with a disabled "Add" affordance.
 */
function OverviewPanel({
  member,
  canManageBilling,
  creditPacks,
  creditCatalogue,
  t,
  locale,
}: {
  member: MemberDetail;
  canManageBilling: boolean;
  creditPacks: CreditPackSummary[];
  creditCatalogue: CreditPackCatalogueEntry[];
  t: T;
  locale: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <ActivityCard activity={member.recentActivity} t={t} locale={locale} />
        <AttendanceCard member={member} t={t} locale={locale} />
      </div>

      <div className="flex flex-col gap-4">
        <CurrentPlanCard
          plan={member.currentPlan}
          memberId={member.id}
          currency={member.currency}
          canManageBilling={canManageBilling}
          t={t}
          locale={locale}
        />
        <CreditsCard
          memberId={member.id}
          packs={creditPacks}
          catalogue={creditCatalogue}
          canManageBilling={canManageBilling}
          t={t}
          locale={locale}
        />
        <TagsCard tags={member.tags} t={t} />
      </div>
    </div>
  );
}

/** The "Recent activity" timeline — merged real check-ins / bookings / payments. */
function ActivityCard({
  activity,
  t,
  locale,
}: {
  activity: MemberActivity[];
  t: T;
  locale: string;
}) {
  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {t('detail.recentActivity')}
      </h3>
      {activity.length === 0 ? (
        <p className="text-sm text-ink-400">{t('detail.noRecentActivity')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {activity.map((entry, i) => (
            <li key={`${entry.kind}-${entry.at}-${i}`} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon name={ACTIVITY_ICON[entry.kind]} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                    {entry.title}
                  </p>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">
                    {formatDateTime(entry.at, locale)}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">{entry.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The "Attendance · last 8 weeks" bar chart — real per-week check-in counts. */
function AttendanceCard({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  const weeks = member.attendance8w;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          {t('detail.attendanceTitle')}
        </h3>
        <span className="font-mono text-xs tabular-nums text-ink-400">
          {t('detail.totalCount', { count: member.totalVisits })}
        </span>
      </div>
      <div className="flex h-32 items-end justify-between gap-2">
        {weeks.map((week) => {
          const label = new Date(week.weekStart).toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
          });
          return (
            <div key={week.weekStart} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-btn bg-[linear-gradient(135deg,#7C3AED,#EC4899)] transition-[height] duration-700 ease-out"
                  style={{
                    height: `${(week.count / max) * 100}%`,
                    minHeight: week.count > 0 ? 6 : 2,
                  }}
                  title={t('detail.visits', { count: week.count })}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-ink-400">{label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** The "Current plan" panel — name / interval / price / renews + days-remaining + freeze. */
function CurrentPlanCard({
  plan,
  memberId,
  currency,
  canManageBilling,
  t,
  locale,
}: {
  plan: MemberCurrentPlan | null;
  memberId: string;
  currency: string;
  canManageBilling: boolean;
  t: T;
  locale: string;
}) {
  if (!plan) {
    return (
      <Card glow className="flex flex-col gap-3 p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          {t('detail.currentPlan')}
        </h3>
        <p className="text-sm text-ink-400">{t('detail.noLiveSubscription')}</p>
      </Card>
    );
  }

  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(plan.currentPeriodEnd).getTime() - new Date(plan.currentPeriodStart).getTime()) /
        86_400_000,
    ),
  );
  const pct = Math.max(0, Math.min(100, (plan.daysRemaining / periodDays) * 100));
  const intervalKey =
    plan.interval === 'YEAR'
      ? 'intervalYear'
      : plan.interval === 'MONTH'
        ? 'intervalMonth'
        : 'intervalPeriod';

  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {t('detail.currentPlan')}
      </h3>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: plan.color ?? '#7C3AED' }}
        />
        <span className="font-display text-lg font-extrabold text-ink-900 dark:text-white">
          {plan.name}
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums text-ink-900 dark:text-white">
          {currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `}
          {(plan.priceAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span className="text-sm text-ink-500 dark:text-ink-400">
          {t('detail.perInterval', { interval: t(`detail.${intervalKey}`) })}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-ink-500 dark:text-ink-400">
          <span>{t('detail.renews', { date: formatDate(plan.currentPeriodEnd, locale) })}</span>
          <span className="font-mono tabular-nums">
            {t('detail.daysLeft', { count: plan.daysRemaining })}
          </span>
        </div>
        <Progress value={pct} />
      </div>

      <PlanFreezeControls
        plan={plan}
        memberId={memberId}
        canManageBilling={canManageBilling}
        t={t}
        locale={locale}
      />
    </Card>
  );
}

/**
 * The "Current plan" freeze / resume controls (T5.7): surfaces the plan's freeze
 * allowance and lets `BillingManage` staff pause or resume the member's membership,
 * wired to the `POST /admin/subscriptions/:id/(un)freeze` endpoints via the member
 * server actions. A frozen plan shows its auto-resume date and a "Resume" action; a
 * live plan shows a "Freeze" button that opens a duration modal. Non-billing staff
 * (or a plan with no allowance) see the affordances disabled — the API re-checks.
 */
function PlanFreezeControls({
  plan,
  memberId,
  canManageBilling,
  t,
  locale,
}: {
  plan: MemberCurrentPlan;
  memberId: string;
  canManageBilling: boolean;
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');

  const isFrozen = plan.status === 'FROZEN';
  const remaining = Math.max(0, plan.freezeDaysPerPeriod - plan.freezeDaysUsed);
  const canFreeze = canManageBilling && plan.status !== 'PAST_DUE' && remaining > 0;

  function submitFreeze(): void {
    const durationDays = Number(days);
    if (!Number.isInteger(durationDays) || durationDays < 1) {
      toast(t('detail.freezeInvalidDuration'), { tone: 'danger', icon: 'info' });
      return;
    }
    startTransition(async () => {
      const result = await freezeMemberSubscriptionAction(memberId, plan.subscriptionId, {
        startDate: new Date().toISOString(),
        durationDays,
      });
      if (result.ok) {
        setOpen(false);
        toast(t('detail.freezeDone'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function resume(): void {
    startTransition(async () => {
      const result = await unfreezeMemberSubscriptionAction(memberId, plan.subscriptionId);
      if (result.ok) {
        toast(t('detail.resumeDone'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <>
      {isFrozen ? (
        <p className="rounded-btn bg-iris-50 px-3 py-2 text-xs font-medium text-iris-700 dark:bg-iris-500/10 dark:text-iris-200">
          {t('detail.frozenUntil', { date: formatDate(plan.frozenUntil ?? '', locale) })}
        </p>
      ) : (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          {t('detail.freezeAllowance', {
            used: plan.freezeDaysUsed,
            total: plan.freezeDaysPerPeriod,
          })}
        </p>
      )}

      <div className="flex gap-2">
        {isFrozen ? (
          <Btn
            v="outline"
            size="sm"
            icon="spark"
            onClick={resume}
            disabled={!canManageBilling || pending}
          >
            {pending ? t('form.saving') : t('detail.resume')}
          </Btn>
        ) : (
          <Btn
            v="outline"
            size="sm"
            icon="clock"
            onClick={() => setOpen(true)}
            disabled={!canFreeze || pending}
            title={canFreeze ? undefined : t('detail.freezeUnavailable')}
          >
            {t('detail.freeze')}
          </Btn>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('detail.freezeModalTitle')}
        description={t('detail.freezeModalBody', { days: remaining })}
        size="sm"
        footer={
          <>
            <Btn v="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t('actions.cancel')}
            </Btn>
            <Btn v="primary" onClick={submitFreeze} disabled={pending}>
              {pending ? t('form.saving') : t('detail.freezeConfirm')}
            </Btn>
          </>
        }
      >
        <Field label={t('detail.freezeDurationLabel')} hint={t('detail.freezeDurationHint')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.min(remaining || MAX_FREEZE_DURATION_DAYS, MAX_FREEZE_DURATION_DAYS)}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}

/**
 * The "Credits" panel (T5.8) — the member's remaining class-credit balance and,
 * for `BillingManage` staff, an "Add credit" modal that sells / grants a pack from
 * the gym's catalogue. Balance is the sum of `remainingCredits` across the member's
 * usable packs (each shown as a row with its remaining / total and expiry). Choosing
 * a pack posts to `POST /admin/members/:id/credit-packs` via the grant action, then
 * refreshes so the new balance shows. Non-billing staff see the balance read-only;
 * a gym with no packs on sale shows no "Add credit" button.
 */
function CreditsCard({
  memberId,
  packs,
  catalogue,
  canManageBilling,
  t,
  locale,
}: {
  memberId: string;
  packs: CreditPackSummary[];
  catalogue: CreditPackCatalogueEntry[];
  canManageBilling: boolean;
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [grantingId, setGrantingId] = useState<string | null>(null);

  const totalRemaining = packs.reduce((sum, pack) => sum + pack.remainingCredits, 0);
  const canBuy = canManageBilling && catalogue.length > 0;

  function grant(pack: CreditPackCatalogueEntry): void {
    setGrantingId(pack.id);
    startTransition(async () => {
      const result = await grantMemberCreditPackAction(memberId, pack.id);
      setGrantingId(null);
      if (result.ok) {
        setOpen(false);
        toast(t('detail.creditGranted', { count: pack.sessionCount }), {
          tone: 'success',
          icon: 'check',
        });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <Card glow className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          {t('detail.credits')}
        </h3>
        <span className="font-mono text-lg font-bold tabular-nums text-ink-900 dark:text-white">
          {totalRemaining}
        </span>
      </div>

      {packs.length === 0 ? (
        <p className="text-sm text-ink-400">{t('detail.noCredits')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {packs.map((pack) => (
            <li key={pack.id} className={ROW_CLASS}>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900 dark:text-white">
                  {pack.planTitle ?? t('detail.creditPack')}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {pack.expiresAt
                    ? t('detail.creditExpires', { date: formatDate(pack.expiresAt, locale) })
                    : t('detail.creditNoExpiry')}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-600 dark:text-ink-300">
                {t('detail.creditRemaining', {
                  remaining: pack.remainingCredits,
                  total: pack.totalCredits,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManageBilling ? (
        <Btn
          v="outline"
          size="sm"
          icon="plus"
          onClick={() => setOpen(true)}
          disabled={!canBuy || pending}
          title={canBuy ? undefined : t('detail.noCreditPacksOnSale')}
        >
          {t('detail.addCredit')}
        </Btn>
      ) : null}

      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t('detail.addCreditModalTitle')}
        description={t('detail.addCreditModalBody')}
        size="sm"
      >
        <ul className="flex flex-col gap-2">
          {catalogue.map((pack) => (
            <li key={pack.id} className={ROW_CLASS}>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900 dark:text-white">{pack.name}</p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {t('detail.creditPackMeta', {
                    count: pack.sessionCount,
                    price: formatAmount(pack.priceAmount, pack.currency),
                  })}
                </p>
              </div>
              <Btn v="primary" size="sm" onClick={() => grant(pack)} disabled={pending}>
                {grantingId === pack.id ? t('form.saving') : t('detail.sell')}
              </Btn>
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

/**
 * Tags — the Prisma schema has NO member-tag / label model, so this is an honest
 * empty state: no chips are ever rendered today (nothing to read), and the "Add"
 * affordance is disabled until a tags model lands. Never fabricated.
 */
function TagsCard({ tags, t }: { tags: string[]; t: T }) {
  return (
    <Card glow className="flex flex-col gap-3 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {t('detail.tags')}
      </h3>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-400">{t('detail.noTags')}</p>
      )}
      <Btn v="outline" size="sm" icon="tag" disabled title={t('detail.tagsDisabledTitle')}>
        {t('detail.add')}
      </Btn>
    </Card>
  );
}
