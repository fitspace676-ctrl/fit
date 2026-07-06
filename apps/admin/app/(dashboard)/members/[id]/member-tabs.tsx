'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import {
  MAX_FREEZE_DURATION_DAYS,
  type CreditPackCatalogueEntry,
  type CreditPackSummary,
  type MemberActivity,
  type MemberActivityKind,
  type MemberCurrentPlan,
  type MemberDetail,
} from '@fit/types';
import { Btn, Field, Icon, Input, Modal, Progress, useToast, type IconName } from '@/components/ui';
import {
  freezeMemberSubscriptionAction,
  grantMemberCreditPackAction,
  unfreezeMemberSubscriptionAction,
} from '../actions';

/** Translator for the `admin.members` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/** The detail page's tab keys, matching the reference order; labels come from `memberTabs.<key>`. */
const TABS = ['overview', 'subscriptions', 'bookings', 'payments', 'invoices', 'notes'] as const;
type Tab = (typeof TABS)[number];

/** Icon per activity kind. */
const ACTIVITY_ICON: Record<MemberActivityKind, IconName> = {
  checkin: 'check',
  booking: 'calendar',
  payment: 'card',
  milestone: 'star',
};

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  tablist: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    flexShrink: 0,
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    background: 'none',
    cursor: 'pointer',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  tabActive: {
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-text-accent)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
  },
  rowMin: {
    minWidth: 0,
  },
  rowTitle: {
    margin: 0,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  rowTitleMono: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  rowTitleTrunc: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  rowSub: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rowStatus: {
    flexShrink: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  rowStatusMono: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  downloadLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  smIcon: {
    width: '1rem',
    height: '1rem',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '1.75rem',
    height: '1.75rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  overviewGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  overviewMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  overviewSide: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  cardTight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  metaMono: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  activityList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  activityRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  activityIcon: {
    marginTop: '0.125rem',
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  activityMain: {
    minWidth: 0,
    flex: 1,
  },
  activityHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  activityTitle: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  activityTime: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  activityDetail: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  chart: {
    display: 'flex',
    height: '8rem',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  chartCol: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  chartBarBox: {
    display: 'flex',
    width: '100%',
    flex: 1,
    alignItems: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderTopLeftRadius: 'var(--radius-inner)',
    borderTopRightRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-accent)',
    transitionProperty: 'height',
    transitionDuration: '700ms',
    transitionTimingFunction: 'ease-out',
  },
  chartLabel: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  planNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  planDot: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    borderRadius: 'var(--radius-full)',
  },
  planName: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.25rem',
  },
  priceValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  priceInterval: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  periodBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  periodHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  periodDays: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  frozenPill: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-accent)',
  },
  freezeNote: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  btnRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  balance: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  tagChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  tagChip: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.625rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
});

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
    <Card variant="default" padding={0} xstyle={styles.emptyCard}>
      <Icon name="info" {...stylex.props(styles.emptyIcon)} />
      <p {...stylex.props(styles.emptyText)}>{children}</p>
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
    <div {...stylex.props(styles.wrap)}>
      <div role="tablist" {...stylex.props(styles.tablist)}>
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab)}
              {...stylex.props(styles.tab, isActive && styles.tabActive)}
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
            <ul {...stylex.props(styles.list)}>
              {member.subscriptions.map((sub) => (
                <li key={sub.id} {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.rowMin)}>
                    <p {...stylex.props(styles.rowTitle)}>{sub.planName}</p>
                    <p {...stylex.props(styles.rowSub)}>
                      {t('detail.subStarted', { date: formatDate(sub.startedAt, locale) })}
                      {sub.renewsAt
                        ? t('detail.subRenews', { date: formatDate(sub.renewsAt, locale) })
                        : ''}
                    </p>
                  </div>
                  <span {...stylex.props(styles.rowStatus)}>{sub.status}</span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'bookings' &&
          (member.bookings.length === 0 ? (
            <EmptyState>{t('detail.noBookings')}</EmptyState>
          ) : (
            <ul {...stylex.props(styles.list)}>
              {member.bookings.map((booking) => (
                <li key={booking.id} {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.rowMin)}>
                    <p {...stylex.props(styles.rowTitle)}>{booking.title}</p>
                    <p {...stylex.props(styles.rowSub)}>
                      {formatDateTime(booking.startsAt, locale)}
                    </p>
                  </div>
                  <span {...stylex.props(styles.rowStatus)}>{booking.status}</span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'payments' &&
          (member.payments.length === 0 ? (
            <EmptyState>{t('detail.noPayments')}</EmptyState>
          ) : (
            <ul {...stylex.props(styles.list)}>
              {member.payments.map((payment) => (
                <li key={payment.id} {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.rowMin)}>
                    <p {...stylex.props(styles.rowTitleMono)}>
                      {formatAmount(payment.amount, member.currency)}
                    </p>
                    <p {...stylex.props(styles.rowSub)}>{formatDate(payment.paidAt, locale)}</p>
                  </div>
                  <span {...stylex.props(styles.rowStatus)}>{payment.status}</span>
                </li>
              ))}
            </ul>
          ))}

        {active === 'invoices' &&
          (member.invoices.length === 0 ? (
            <EmptyState>{t('detail.noInvoices')}</EmptyState>
          ) : (
            <ul {...stylex.props(styles.list)}>
              {member.invoices.map((invoice) => (
                <li key={invoice.id} {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.rowMin)}>
                    <p {...stylex.props(styles.rowTitleMono)}>
                      {invoice.number} · {formatAmount(invoice.amount, invoice.currency)}
                    </p>
                    <p {...stylex.props(styles.rowSub)}>
                      {formatDate(invoice.issuedAt, locale)} · {invoice.status}
                    </p>
                  </div>
                  {/* Download proxy is a root-relative admin route handler, not a data
                      action — a plain <a> so the browser handles the file download. */}
                  <a
                    href={`/invoices/${invoice.id}/pdf`}
                    aria-label={t('detail.downloadInvoice')}
                    {...stylex.props(styles.downloadLink)}
                  >
                    <Icon name="download" {...stylex.props(styles.smIcon)} /> {t('detail.download')}
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
    <div {...stylex.props(styles.overviewGrid)}>
      <div {...stylex.props(styles.overviewMain)}>
        <ActivityCard activity={member.recentActivity} t={t} locale={locale} />
        <AttendanceCard member={member} t={t} locale={locale} />
      </div>

      <div {...stylex.props(styles.overviewSide)}>
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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.recentActivity')}</h3>
      {activity.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noRecentActivity')}</p>
      ) : (
        <ul {...stylex.props(styles.activityList)}>
          {activity.map((entry, i) => (
            <li key={`${entry.kind}-${entry.at}-${i}`} {...stylex.props(styles.activityRow)}>
              <span {...stylex.props(styles.activityIcon)}>
                <Icon name={ACTIVITY_ICON[entry.kind]} {...stylex.props(styles.smIcon)} />
              </span>
              <div {...stylex.props(styles.activityMain)}>
                <div {...stylex.props(styles.activityHead)}>
                  <p {...stylex.props(styles.activityTitle)}>{entry.title}</p>
                  <span {...stylex.props(styles.activityTime)}>
                    {formatDateTime(entry.at, locale)}
                  </span>
                </div>
                <p {...stylex.props(styles.activityDetail)}>{entry.detail}</p>
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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.attendanceTitle')}</h3>
        <span {...stylex.props(styles.metaMono)}>
          {t('detail.totalCount', { count: member.totalVisits })}
        </span>
      </div>
      <div {...stylex.props(styles.chart)}>
        {weeks.map((week) => {
          const label = new Date(week.weekStart).toLocaleDateString(locale, {
            month: 'short',
            day: 'numeric',
          });
          return (
            <div key={week.weekStart} {...stylex.props(styles.chartCol)}>
              <div {...stylex.props(styles.chartBarBox)}>
                <div
                  {...stylex.props(styles.chartBar)}
                  style={{
                    height: `${(week.count / max) * 100}%`,
                    minHeight: week.count > 0 ? 6 : 2,
                  }}
                  title={t('detail.visits', { count: week.count })}
                />
              </div>
              <span {...stylex.props(styles.chartLabel)}>{label}</span>
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
      <Card variant="default" padding={0} xstyle={styles.cardTight}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.currentPlan')}</h3>
        <p {...stylex.props(styles.mutedText)}>{t('detail.noLiveSubscription')}</p>
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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.currentPlan')}</h3>

      <div {...stylex.props(styles.planNameRow)}>
        <span
          aria-hidden
          {...stylex.props(styles.planDot)}
          style={{ backgroundColor: plan.color ?? '#6257E3' }}
        />
        <span {...stylex.props(styles.planName)}>{plan.name}</span>
      </div>

      <div {...stylex.props(styles.priceRow)}>
        <span {...stylex.props(styles.priceValue)}>
          {currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `}
          {(plan.priceAmount / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </span>
        <span {...stylex.props(styles.priceInterval)}>
          {t('detail.perInterval', { interval: t(`detail.${intervalKey}`) })}
        </span>
      </div>

      <div {...stylex.props(styles.periodBlock)}>
        <div {...stylex.props(styles.periodHead)}>
          <span>{t('detail.renews', { date: formatDate(plan.currentPeriodEnd, locale) })}</span>
          <span {...stylex.props(styles.periodDays)}>
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
        <p {...stylex.props(styles.frozenPill)}>
          {t('detail.frozenUntil', { date: formatDate(plan.frozenUntil ?? '', locale) })}
        </p>
      ) : (
        <p {...stylex.props(styles.freezeNote)}>
          {t('detail.freezeAllowance', {
            used: plan.freezeDaysUsed,
            total: plan.freezeDaysPerPeriod,
          })}
        </p>
      )}

      <div {...stylex.props(styles.btnRow)}>
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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHead)}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.credits')}</h3>
        <span {...stylex.props(styles.balance)}>{totalRemaining}</span>
      </div>

      {packs.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noCredits')}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {packs.map((pack) => (
            <li key={pack.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitleTrunc)}>
                  {pack.planTitle ?? t('detail.creditPack')}
                </p>
                <p {...stylex.props(styles.rowSub)}>
                  {pack.expiresAt
                    ? t('detail.creditExpires', { date: formatDate(pack.expiresAt, locale) })
                    : t('detail.creditNoExpiry')}
                </p>
              </div>
              <span {...stylex.props(styles.rowStatusMono)}>
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
        <ul {...stylex.props(styles.list)}>
          {catalogue.map((pack) => (
            <li key={pack.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitleTrunc)}>{pack.name}</p>
                <p {...stylex.props(styles.rowSub)}>
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
    <Card variant="default" padding={0} xstyle={styles.cardTight}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.tags')}</h3>
      {tags.length > 0 ? (
        <div {...stylex.props(styles.tagChips)}>
          {tags.map((tag) => (
            <span key={tag} {...stylex.props(styles.tagChip)}>
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noTags')}</p>
      )}
      <Btn v="outline" size="sm" icon="tag" disabled title={t('detail.tagsDisabledTitle')}>
        {t('detail.add')}
      </Btn>
    </Card>
  );
}
