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
  type MemberLoyaltyResponse,
  type MemberNoteEntry,
  type MemberTaskEntry,
} from '@fit/types';
import {
  Badge,
  Btn,
  Field,
  Icon,
  Input,
  Modal,
  Progress,
  Textarea,
  useToast,
  type IconName,
} from '@/components/ui';
import {
  addMemberNoteAction,
  addMemberTaskAction,
  adjustMemberPointsAction,
  freezeMemberSubscriptionAction,
  grantMemberCreditPackAction,
  toggleMemberTaskAction,
  unfreezeMemberSubscriptionAction,
} from '../actions';

/** Translator for the `admin.members` namespace (from `useTranslations`). */
type T = ReturnType<typeof useTranslations>;

/**
 * The detail page's tab keys — the reference's seven-tab member experience, ported
 * onto our data. Labels come from `memberTabs.<key>`.
 */
const TABS = [
  'overview',
  'profile',
  'membership',
  'payments',
  'purchases',
  'access',
  'loyalty',
  'notesTasks',
] as const;
type Tab = (typeof TABS)[number];

/** Icon per activity kind. */
const ACTIVITY_ICON: Record<MemberActivityKind, IconName> = {
  checkin: 'check',
  booking: 'calendar',
  payment: 'card',
  milestone: 'star',
};

const DAY_MS = 86_400_000;

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
    whiteSpace: 'nowrap',
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
  // Overview stat cards.
  statGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(6, minmax(0, 1fr))',
    },
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1rem',
  },
  statIcon: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  statValue: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  statValueSm: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
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
  // Profile field grid.
  fieldGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  fieldLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  fieldValue: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    overflowWrap: 'anywhere',
  },
  panelStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
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
  medicalPanel: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.875rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
    whiteSpace: 'pre-wrap',
  },
  // Notes & tasks.
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  addFormRow: {
    display: 'grid',
    gap: '0.625rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  addFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
  noteTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.875rem',
  },
  noteHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  noteAuthor: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  noteBody: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  taskRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    paddingBlock: '0.75rem',
  },
  taskCheck: {
    marginTop: '0.125rem',
    display: 'grid',
    height: '1.25rem',
    width: '1.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    background: 'none',
    cursor: 'pointer',
    color: 'var(--color-on-accent)',
  },
  taskCheckDone: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
  },
  taskMain: {
    minWidth: 0,
    flex: 1,
  },
  taskTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
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

/** A profile display value, falling back to an em dash when unset. */
function dash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '—';
}

/** A centered empty-state line shown when a tab/section has no records yet. */
function EmptyState({ children }: { children: string }) {
  return (
    <Card variant="default" padding={0} xstyle={styles.emptyCard}>
      <Icon name="info" {...stylex.props(styles.emptyIcon)} />
      <p {...stylex.props(styles.emptyText)}>{children}</p>
    </Card>
  );
}

/** A read-only label/value pair in the Profile tab. */
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div {...stylex.props(styles.field)}>
      <p {...stylex.props(styles.fieldLabel)}>{label}</p>
      <p {...stylex.props(styles.fieldValue)}>{value}</p>
    </div>
  );
}

/**
 * The member detail page's tabbed experience, ported from the reference's seven
 * tabs onto our data: Overview, Profile, Membership, Payments, Purchases, Access
 * Log and Notes & Tasks. Data is fetched server-side and passed in; this component
 * owns the active-tab selection and the interactive notes/tasks forms. Every
 * populated surface is a real, tenant-scoped fact; empty collections render honest
 * empty states.
 */
export function MemberTabs({
  member,
  canManageBilling,
  creditPacks,
  creditCatalogue,
  loyalty,
  canManageLoyalty,
}: {
  member: MemberDetail;
  canManageBilling: boolean;
  creditPacks: CreditPackSummary[];
  creditCatalogue: CreditPackCatalogueEntry[];
  loyalty: MemberLoyaltyResponse | null;
  canManageLoyalty: boolean;
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
        {active === 'overview' && <OverviewPanel member={member} t={t} locale={locale} />}
        {active === 'profile' && <ProfilePanel member={member} t={t} locale={locale} />}
        {active === 'membership' && (
          <MembershipPanel
            member={member}
            canManageBilling={canManageBilling}
            creditPacks={creditPacks}
            creditCatalogue={creditCatalogue}
            t={t}
            locale={locale}
          />
        )}
        {active === 'payments' && <PaymentsPanel member={member} t={t} locale={locale} />}
        {active === 'purchases' && <PurchasesPanel member={member} t={t} locale={locale} />}
        {active === 'access' && <AccessLogPanel member={member} t={t} locale={locale} />}
        {active === 'loyalty' && (
          <LoyaltyPanel
            member={member}
            loyalty={loyalty}
            canManage={canManageLoyalty}
            t={t}
            locale={locale}
          />
        )}
        {active === 'notesTasks' && <NotesTasksPanel member={member} t={t} locale={locale} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

/**
 * Overview — a row of six key stats, then the "Recent activity" timeline +
 * "Attendance · last 8 weeks" chart, with a side column carrying a read-only
 * current-membership summary, tags, and quick recent-notes / upcoming-tasks lists.
 */
function OverviewPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      <StatCards member={member} t={t} locale={locale} />
      <div {...stylex.props(styles.overviewGrid)}>
        <div {...stylex.props(styles.overviewMain)}>
          <ActivityCard activity={member.recentActivity} t={t} locale={locale} />
          <AttendanceCard member={member} t={t} locale={locale} />
        </div>
        <div {...stylex.props(styles.overviewSide)}>
          <MembershipSummaryCard member={member} t={t} locale={locale} />
          <TagsCard tags={member.tags} t={t} />
          <QuickNotesCard notes={member.notes} t={t} locale={locale} />
          <QuickTasksCard tasks={member.tasks} t={t} locale={locale} />
        </div>
      </div>
    </div>
  );
}

/** One compact stat card — icon tile, headline value, label. */
function StatCard({
  icon,
  value,
  label,
  small,
}: {
  icon: IconName;
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.statCard}>
      <span {...stylex.props(styles.statIcon)}>
        <Icon name={icon} {...stylex.props(styles.smIcon)} />
      </span>
      <p {...stylex.props(small ? styles.statValueSm : styles.statValue)}>{value}</p>
      <p {...stylex.props(styles.statLabel)}>{label}</p>
    </Card>
  );
}

/** The six overview stats — every figure a real, tenant-scoped count. */
function StatCards({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  const now = new Date();
  const visitsThisMonth = member.accessLog.filter((entry) => {
    const at = new Date(entry.at);
    return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
  }).length;
  const eightWeekTotal = member.attendance8w.reduce((sum, week) => sum + week.count, 0);
  const avgPerWeek = (eightWeekTotal / member.attendance8w.length || 0).toFixed(1);
  const pendingTasks = member.tasks.filter((task) => task.status === 'PENDING').length;
  const lastVisit = member.lastVisitAt ? formatDate(member.lastVisitAt, locale) : '—';

  return (
    <div {...stylex.props(styles.statGrid)}>
      <StatCard icon="spark" value={String(visitsThisMonth)} label={t('stats.visitsThisMonth')} />
      <StatCard icon="check" value={String(member.totalVisits)} label={t('stats.totalVisits')} />
      <StatCard icon="clock" value={avgPerWeek} label={t('stats.avgPerWeek')} />
      <StatCard icon="calendar" value={lastVisit} label={t('stats.lastVisit')} small />
      <StatCard icon="target" value={String(pendingTasks)} label={t('stats.pendingTasks')} />
      <StatCard icon="message" value={String(member.notes.length)} label={t('stats.totalNotes')} />
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

/** A read-only current-membership summary for the Overview side column. */
function MembershipSummaryCard({
  member,
  t,
  locale,
}: {
  member: MemberDetail;
  t: T;
  locale: string;
}) {
  const plan = member.currentPlan;
  return (
    <Card variant="default" padding={0} xstyle={styles.cardTight}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.currentMembership')}</h3>
      {plan ? (
        <>
          <div {...stylex.props(styles.planNameRow)}>
            <span
              aria-hidden
              {...stylex.props(styles.planDot)}
              style={{ backgroundColor: plan.color ?? '#6257E3' }}
            />
            <span {...stylex.props(styles.planName)}>{plan.name}</span>
          </div>
          <FieldRow
            label={t('detail.price')}
            value={`${formatAmount(plan.priceAmount, plan.currency)}`}
          />
          <FieldRow
            label={t('detail.startDate')}
            value={formatDate(plan.currentPeriodStart, locale)}
          />
          <FieldRow
            label={t('detail.currentTerm')}
            value={formatDate(plan.currentPeriodEnd, locale)}
          />
        </>
      ) : (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noLiveSubscription')}</p>
      )}
    </Card>
  );
}

/** Quick "Recent notes" preview (first three) for the Overview. */
function QuickNotesCard({ notes, t, locale }: { notes: MemberNoteEntry[]; t: T; locale: string }) {
  return (
    <Card variant="default" padding={0} xstyle={styles.cardTight}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.recentNotes')}</h3>
      {notes.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noNotes')}</p>
      ) : (
        notes.slice(0, 3).map((note) => (
          <div key={note.id} {...stylex.props(styles.noteTile)}>
            <div {...stylex.props(styles.noteHead)}>
              <p {...stylex.props(styles.noteAuthor)}>{note.author}</p>
              <span {...stylex.props(styles.metaMono)}>{formatDate(note.createdAt, locale)}</span>
            </div>
            <p {...stylex.props(styles.noteBody)}>{note.body}</p>
          </div>
        ))
      )}
    </Card>
  );
}

/** Quick "Upcoming tasks" preview (first three pending) for the Overview. */
function QuickTasksCard({ tasks, t, locale }: { tasks: MemberTaskEntry[]; t: T; locale: string }) {
  const pending = tasks.filter((task) => task.status === 'PENDING').slice(0, 3);
  return (
    <Card variant="default" padding={0} xstyle={styles.cardTight}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.upcomingTasks')}</h3>
      {pending.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noTasks')}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {pending.map((task) => (
            <li key={task.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitle)}>{task.title}</p>
                {task.dueDate ? (
                  <p {...stylex.props(styles.rowSub)}>
                    {t('detail.taskDue', { date: formatDate(task.dueDate, locale) })}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

/** Profile — read-only personal details, emergency contact and medical notes. */
function ProfilePanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  const genderLabel = member.gender ? t(`gender.${member.gender}`) : '—';
  return (
    <div {...stylex.props(styles.panelStack)}>
      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.basicInformation')}</h3>
        <div {...stylex.props(styles.fieldGrid)}>
          <FieldRow label={t('detail.fullName')} value={dash(member.name)} />
          <FieldRow label={t('detail.email')} value={dash(member.email)} />
          <FieldRow label={t('detail.phone')} value={dash(member.phone)} />
          <FieldRow
            label={t('detail.dateOfBirth')}
            value={member.dateOfBirth ? formatDate(member.dateOfBirth, locale) : '—'}
          />
          <FieldRow label={t('detail.gender')} value={genderLabel} />
          <FieldRow label={t('detail.address')} value={dash(member.address)} />
        </div>
      </Card>

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.emergencyContact')}</h3>
        <div {...stylex.props(styles.fieldGrid)}>
          <FieldRow label={t('detail.contactName')} value={dash(member.emergencyContactName)} />
          <FieldRow label={t('detail.contactPhone')} value={dash(member.emergencyContactPhone)} />
        </div>
      </Card>

      <Card variant="default" padding={0} xstyle={styles.cardTight}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.medicalNotes')}</h3>
        {member.medicalNotes ? (
          <p {...stylex.props(styles.medicalPanel)}>{member.medicalNotes}</p>
        ) : (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noMedicalNotes')}</p>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Membership                                                         */
/* ------------------------------------------------------------------ */

/** Membership — the current plan (with freeze), credits, previous memberships and bookings. */
function MembershipPanel({
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
        <PreviousMembershipsCard member={member} t={t} locale={locale} />
        <BookingsCard member={member} t={t} locale={locale} />
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
      </div>
    </div>
  );
}

/** The member's previous / historical memberships (subscriptions), newest first. */
function PreviousMembershipsCard({
  member,
  t,
  locale,
}: {
  member: MemberDetail;
  t: T;
  locale: string;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.previousMemberships')}</h3>
      {member.subscriptions.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noSubscriptions')}</p>
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
      )}
    </Card>
  );
}

/** The member's recent class bookings, newest first. */
function BookingsCard({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.classBookings')}</h3>
      {member.bookings.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noBookings')}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {member.bookings.map((booking) => (
            <li key={booking.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitle)}>{booking.title}</p>
                <p {...stylex.props(styles.rowSub)}>{formatDateTime(booking.startsAt, locale)}</p>
              </div>
              <span {...stylex.props(styles.rowStatus)}>{booking.status}</span>
            </li>
          ))}
        </ul>
      )}
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
        DAY_MS,
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

/* ------------------------------------------------------------------ */
/*  Payments / Purchases / Access Log                                 */
/* ------------------------------------------------------------------ */

/** Payments — captured payments + numbered invoices (with PDF download). */
function PaymentsPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.paymentHistory')}</h3>
        {member.payments.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noPayments')}</p>
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
        )}
      </Card>

      <Card variant="default" padding={0} xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.invoices')}</h3>
        {member.invoices.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('detail.noInvoices')}</p>
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
                  href={`/payments/invoices/${invoice.id}/pdf`}
                  aria-label={t('detail.downloadInvoice')}
                  {...stylex.props(styles.downloadLink)}
                >
                  <Icon name="download" {...stylex.props(styles.smIcon)} /> {t('detail.download')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Purchases — the member's POS orders (items, total, method), newest first. */
function PurchasesPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  if (member.purchases.length === 0) {
    return <EmptyState>{t('detail.noPurchases')}</EmptyState>;
  }
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.purchaseHistory')}</h3>
      <ul {...stylex.props(styles.list)}>
        {member.purchases.map((purchase) => {
          const items = purchase.items
            .map((item) => (item.qty > 1 ? `${item.label} ×${item.qty}` : item.label))
            .join(', ');
          return (
            <li key={purchase.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitleTrunc)}>{items || '—'}</p>
                <p {...stylex.props(styles.rowSub)}>
                  {formatDateTime(purchase.at, locale)}
                  {purchase.method ? ` · ${purchase.method}` : ''}
                </p>
              </div>
              <span {...stylex.props(styles.rowStatusMono)}>
                {formatAmount(purchase.total, purchase.currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Access Log — the member's check-ins (arrivals), newest first. */
function AccessLogPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  if (member.accessLog.length === 0) {
    return <EmptyState>{t('detail.noAccessLog')}</EmptyState>;
  }
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.accessLog')}</h3>
      <ul {...stylex.props(styles.list)}>
        {member.accessLog.map((entry) => (
          <li key={entry.id} {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.rowMin)}>
              <p {...stylex.props(styles.rowTitle)}>{t('detail.checkIn')}</p>
              <p {...stylex.props(styles.rowSub)}>{formatDateTime(entry.at, locale)}</p>
            </div>
            <span {...stylex.props(styles.rowStatus)}>{entry.method}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loyalty                                                            */
/* ------------------------------------------------------------------ */

const loyaltyStyles = stylex.create({
  balanceCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-surface)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  balanceHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  balanceCopy: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  balanceLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-text-secondary)',
  },
  balanceValue: {
    fontSize: '2rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  ledgerLabel: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  ledgerRowMain: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  ledgerNote: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  ledgerRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.125rem',
  },
  delta: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  deltaPos: { color: 'var(--color-success)' },
  deltaNeg: { color: 'var(--color-error)' },
  balanceAfter: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
});

/**
 * Loyalty — the member's points balance and recent ledger, with a manual points
 * adjustment behind `LoyaltyManage`. Reads come from `GET /loyalty/members/:id`
 * (fetched by the page); the adjust dialog posts a signed delta through the
 * member server action and refreshes the detail so the new balance + entry show.
 * A member with no loyalty data (read failed or none yet) renders an honest
 * empty state.
 */
function LoyaltyPanel({
  member,
  loyalty,
  canManage,
  t,
  locale,
}: {
  member: MemberDetail;
  loyalty: MemberLoyaltyResponse | null;
  canManage: boolean;
  t: T;
  locale: string;
}) {
  const [open, setOpen] = useState(false);

  if (loyalty === null) {
    return <EmptyState>{t('loyalty.emptyLedger')}</EmptyState>;
  }

  const balanceText = t('loyalty.pointsValue', {
    points: loyalty.balance.toLocaleString(locale),
  });

  return (
    <div {...stylex.props(styles.panelStack)}>
      <div {...stylex.props(loyaltyStyles.balanceCard)}>
        <div {...stylex.props(loyaltyStyles.balanceHead)}>
          <div {...stylex.props(loyaltyStyles.balanceCopy)}>
            <span {...stylex.props(loyaltyStyles.balanceLabel)}>{t('loyalty.balanceLabel')}</span>
            <span {...stylex.props(loyaltyStyles.balanceValue)}>{balanceText}</span>
          </div>
          {canManage ? (
            <Btn v="outline" size="sm" icon="spark" onClick={() => setOpen(true)}>
              {t('loyalty.adjust')}
            </Btn>
          ) : null}
        </div>

        <p {...stylex.props(loyaltyStyles.ledgerLabel)}>{t('loyalty.ledgerHeading')}</p>
        {loyalty.entries.length === 0 ? (
          <p {...stylex.props(styles.mutedText)}>{t('loyalty.emptyLedger')}</p>
        ) : (
          <ul {...stylex.props(styles.list)}>
            {loyalty.entries.map((entry) => {
              const positive = entry.delta >= 0;
              const sign = positive ? '+' : '−';
              const magnitude = Math.abs(entry.delta).toLocaleString(locale);
              return (
                <li key={entry.id} {...stylex.props(styles.row)}>
                  <div {...stylex.props(loyaltyStyles.ledgerRowMain)}>
                    <Badge tone={positive ? 'success' : 'ink'}>
                      {t(`loyalty.reasons.${entry.reason}`)}
                    </Badge>
                    <span {...stylex.props(loyaltyStyles.ledgerNote)}>
                      {entry.note ?? formatDateTime(entry.createdAt, locale)}
                    </span>
                  </div>
                  <div {...stylex.props(loyaltyStyles.ledgerRight)}>
                    <span
                      {...stylex.props(
                        loyaltyStyles.delta,
                        positive ? loyaltyStyles.deltaPos : loyaltyStyles.deltaNeg,
                      )}
                    >
                      {`${sign}${magnitude}`}
                    </span>
                    <span {...stylex.props(loyaltyStyles.balanceAfter)}>
                      {t('loyalty.balanceAfter', {
                        points: entry.balanceAfter.toLocaleString(locale),
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!canManage ? <p {...stylex.props(styles.mutedText)}>{t('loyalty.readOnly')}</p> : null}
      </div>

      {open ? (
        <AdjustPointsModal
          memberId={member.id}
          memberName={member.name}
          onClose={() => setOpen(false)}
          t={t}
        />
      ) : null}
    </div>
  );
}

/** A signed integer parsed from a string, or `undefined` when blank/invalid/zero. */
function signedInt(value: string): number | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

/**
 * The Adjust Points dialog (T12.11) — a signed, non-zero delta with an optional
 * note. Posts through {@link adjustMemberPointsAction} (gated by `LoyaltyManage`)
 * and, on success, refreshes the detail so the new balance + ledger entry show.
 */
function AdjustPointsModal({
  memberId,
  memberName,
  onClose,
  t,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
  t: T;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  const parsedDelta = signedInt(delta);
  const canSubmit = parsedDelta !== undefined;

  function submit(): void {
    if (!canSubmit || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustMemberPointsAction(memberId, {
        delta: parsedDelta,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (result.ok) {
        toast(t('loyalty.adjusted'), { tone: 'success', icon: 'check' });
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Modal
      open
      onClose={() => (pending ? undefined : onClose())}
      title={t('loyalty.adjustTitle')}
      description={t('loyalty.adjustDescription', { name: memberName })}
      size="sm"
      footer={
        <>
          <Btn v="outline" size="md" onClick={onClose} disabled={pending}>
            {t('loyalty.cancel')}
          </Btn>
          <Btn v="primary" size="md" onClick={submit} disabled={pending || !canSubmit}>
            {pending ? t('loyalty.saving') : t('loyalty.adjustSubmit')}
          </Btn>
        </>
      }
    >
      <div {...stylex.props(loyaltyStyles.form)}>
        {error ? (
          <div {...stylex.props(loyaltyStyles.errorCard)}>
            <Icon name="info" {...stylex.props(loyaltyStyles.errorIcon)} />
            <p role="alert" {...stylex.props(loyaltyStyles.errorText)}>
              {error}
            </p>
          </div>
        ) : null}

        <Field label={t('loyalty.deltaLabel')} hint={t('loyalty.deltaHint')}>
          <Input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder={t('loyalty.deltaPlaceholder')}
            autoFocus
          />
        </Field>

        <Field label={t('loyalty.noteLabel')}>
          <Textarea
            rows={2}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('loyalty.notePlaceholder')}
          />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Notes & Tasks                                                      */
/* ------------------------------------------------------------------ */

/**
 * Notes & Tasks — interactive staff notes and follow-up tasks. `MemberWrite` staff
 * can add a note, log a task, and toggle a task done; each mutation posts through
 * the member server actions and refreshes the detail. Non-write staff see the lists
 * read-only (the forms/toggles are hidden). Every row is a real record.
 */
function NotesTasksPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.overviewGrid)}>
      <div {...stylex.props(styles.overviewMain)}>
        <NotesCard memberId={member.id} notes={member.notes} t={t} locale={locale} />
      </div>
      <div {...stylex.props(styles.overviewSide)}>
        <TasksCard memberId={member.id} tasks={member.tasks} t={t} locale={locale} />
      </div>
    </div>
  );
}

/** Staff notes — an add-note form + the notes list, newest first. */
function NotesCard({
  memberId,
  notes,
  t,
  locale,
}: {
  memberId: string;
  notes: MemberNoteEntry[];
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');

  function submit(): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addMemberNoteAction(memberId, { body: trimmed });
      if (result.ok) {
        setBody('');
        toast(t('detail.noteAdded'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.staffNotes')}</h3>

      <div {...stylex.props(styles.addForm)}>
        <Textarea
          rows={3}
          placeholder={t('detail.addNotePlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div {...stylex.props(styles.addFormActions)}>
          <Btn
            v="primary"
            size="sm"
            icon="plus"
            onClick={submit}
            disabled={pending || !body.trim()}
          >
            {pending ? t('form.saving') : t('detail.addNote')}
          </Btn>
        </div>
      </div>

      {notes.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noNotes')}</p>
      ) : (
        <div {...stylex.props(styles.panelStack)}>
          {notes.map((note) => (
            <div key={note.id} {...stylex.props(styles.noteTile)}>
              <div {...stylex.props(styles.noteHead)}>
                <p {...stylex.props(styles.noteAuthor)}>{note.author}</p>
                <span {...stylex.props(styles.metaMono)}>
                  {formatDateTime(note.createdAt, locale)}
                </span>
              </div>
              <p {...stylex.props(styles.noteBody)}>{note.body}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Follow-up tasks — an add-task form + the task list with a done toggle. */
function TasksCard({
  memberId,
  tasks,
  t,
  locale,
}: {
  memberId: string;
  tasks: MemberTaskEntry[];
  t: T;
  locale: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');

  function addTask(): void {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addMemberTaskAction(memberId, {
        title: trimmed,
        dueDate: dueDate || undefined,
        assignee: assignee.trim() || undefined,
      });
      if (result.ok) {
        setTitle('');
        setDueDate('');
        setAssignee('');
        toast(t('detail.taskAdded'), { tone: 'success', icon: 'check' });
        router.refresh();
      } else {
        toast(result.error, { tone: 'danger', icon: 'info' });
      }
    });
  }

  function toggle(task: MemberTaskEntry): void {
    startTransition(async () => {
      const result = await toggleMemberTaskAction(
        memberId,
        task.id,
        task.status === 'DONE' ? 'PENDING' : 'DONE',
      );
      if (!result.ok) {
        toast(result.error, { tone: 'danger', icon: 'info' });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.tasks')}</h3>

      <div {...stylex.props(styles.addForm)}>
        <Input
          placeholder={t('detail.taskTitlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div {...stylex.props(styles.addFormRow)}>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input
            placeholder={t('detail.taskAssigneePlaceholder')}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
        </div>
        <div {...stylex.props(styles.addFormActions)}>
          <Btn
            v="primary"
            size="sm"
            icon="plus"
            onClick={addTask}
            disabled={pending || !title.trim()}
          >
            {pending ? t('form.saving') : t('detail.addTask')}
          </Btn>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noTasks')}</p>
      ) : (
        <div {...stylex.props(styles.panelStack)}>
          {tasks.map((task) => {
            const done = task.status === 'DONE';
            return (
              <div key={task.id} {...stylex.props(styles.taskRow)}>
                <button
                  type="button"
                  aria-label={done ? t('detail.taskMarkPending') : t('detail.taskMarkDone')}
                  onClick={() => toggle(task)}
                  disabled={pending}
                  {...stylex.props(styles.taskCheck, done && styles.taskCheckDone)}
                >
                  {done ? <Icon name="check" {...stylex.props(styles.smIcon)} /> : null}
                </button>
                <div {...stylex.props(styles.taskMain)}>
                  <p {...stylex.props(styles.taskTitle, done && styles.taskTitleDone)}>
                    {task.title}
                  </p>
                  <p {...stylex.props(styles.rowSub)}>
                    {task.dueDate
                      ? t('detail.taskDue', { date: formatDate(task.dueDate, locale) })
                      : t('detail.taskNoDue')}
                    {task.assignee ? ` · ${task.assignee}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * Tags — colour-keyed labels applied by staff (`GymMember.tags`), shown as chips.
 * Editing tags happens through the member Edit form; this is a read-only display.
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
    </Card>
  );
}
