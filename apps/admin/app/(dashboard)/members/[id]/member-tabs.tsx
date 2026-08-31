'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import {
  MAX_FREEZE_DURATION_DAYS,
  type CreditPackCatalogueEntry,
  type CreditPackSummary,
  type MemberActivity,
  type MemberActivityKind,
  type MemberCurrentPlan,
  type MemberDetail,
  type MemberNoteEntry,
} from '@fit/types';
import { Button, Card, Dialog, Field, Meter, TextareaField } from '@fit/ui-kit';
import { Icon, useToast, type IconName } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { useTheme } from '@/components/theme/theme-provider';
import {
  addMemberNoteAction,
  freezeMemberSubscriptionAction,
  grantMemberCreditPackAction,
  unfreezeMemberSubscriptionAction,
} from '../actions';
import { createDateTimeFormat, createNumberFormat, defaultLocale } from '@fit/i18n';

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
  'invoices',
  'purchases',
  'access',
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
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
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
    // No rule under the bar in light mode — the active pill alone carries the
    // state; dark keeps the hairline under its underline tabs.
    borderBottomColor: 'light-dark(transparent, var(--color-border))',
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
    borderBottomColor: 'var(--color-text-accent)',
    color: 'var(--color-text-accent)',
  },
  // The active tab, light mode: a brand pill — the raw lime with the theme's
  // on-accent ink, the member portal's pairing (mirrors the dashboard's
  // segment tabs). A separate per-theme style, not `light-dark()`: the pill's
  // radius is a length, which `light-dark()` cannot carry — and dark must keep
  // its straight underline.
  tabActiveLight: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    borderBottomColor: 'transparent',
    borderRadius: '9999px',
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
  // The slot that owns the Staff Notes card in the Overview side column. On desktop
  // it is `position: relative` and `flex: 1`, but because its child card is absolutely
  // positioned it contributes no intrinsic height — so the grid row height is driven by
  // the (taller) Recent Activity column, and this slot just stretches to match it. On
  // mobile (stacked) it's a normal block so the card flows at its natural/capped height.
  notesSlot: {
    minHeight: 0,
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'relative',
    },
    flexGrow: {
      default: 0,
      '@media (min-width: 1024px)': 1,
    },
  },
  // The Staff Notes card. On desktop it absolutely fills its slot (see `notesSlot`) so
  // it equals the Recent Activity column's height and its list scrolls inside; on mobile
  // it flows normally with a capped height so a long list still scrolls, never overflows.
  notesFill: {
    maxHeight: {
      default: '32rem',
      '@media (min-width: 1024px)': 'none',
    },
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'absolute',
    },
    top: { default: 'auto', '@media (min-width: 1024px)': 0 },
    right: { default: 'auto', '@media (min-width: 1024px)': 0 },
    bottom: { default: 'auto', '@media (min-width: 1024px)': 0 },
    left: { default: 'auto', '@media (min-width: 1024px)': 0 },
  },
  // The scrollable notes list inside the Staff Notes card: takes the remaining card
  // height and scrolls when the notes overflow, keeping the newest note pinned at top.
  notesScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
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
    backgroundImage: 'var(--brand-fill-image, none)',
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
    backgroundImage: 'var(--brand-fill-image, none)',
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
  return `${symbol}${createNumberFormat(defaultLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100)}`;
}

/** Format an ISO instant as a short local date. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : createDateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
        date,
      );
}

/** Format an ISO instant as a short local date-time. */
function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : createDateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

/** A profile display value, falling back to an em dash when unset. */
function dash(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '-';
}

/** A centered empty-state line shown when a tab/section has no records yet. */
function EmptyState({ children }: { children: string }) {
  return (
    <Card padding="none" xstyle={styles.emptyCard}>
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
 * The member detail page's tabbed experience: Overview, Profile, Membership,
 * Payments, Invoices, Purchases and Access Log. Data is fetched server-side and passed in;
 * this component owns the active-tab selection. The Overview surfaces the full
 * staff Notes section (add + list). Every populated surface is a real,
 * tenant-scoped fact; empty collections render honest empty states.
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
  const { theme } = useTheme();
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
              {...stylex.props(
                styles.tab,
                isActive && styles.tabActive,
                isActive && theme === 'light' && styles.tabActiveLight,
              )}
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
        {active === 'invoices' && <InvoicesPanel member={member} t={t} locale={locale} />}
        {active === 'purchases' && <PurchasesPanel member={member} t={t} locale={locale} />}
        {active === 'access' && <AccessLogPanel member={member} t={t} locale={locale} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

/**
 * Overview — a row of key stats, then the "Recent activity" timeline and the full
 * staff Notes section, with a side column carrying a read-only current-membership
 * summary.
 */
function OverviewPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      <StatCards member={member} t={t} locale={locale} />
      <div {...stylex.props(styles.overviewGrid)}>
        <div {...stylex.props(styles.overviewMain)}>
          <ActivityCard activity={member.recentActivity} t={t} locale={locale} />
        </div>
        <div {...stylex.props(styles.overviewSide)}>
          <MembershipSummaryCard member={member} t={t} locale={locale} />
          <div {...stylex.props(styles.notesSlot)}>
            <NotesCard memberId={member.id} notes={member.notes} t={t} locale={locale} />
          </div>
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
    <Card padding="none" xstyle={styles.statCard}>
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
  const lastVisit = member.lastVisitAt ? formatDate(member.lastVisitAt, locale) : '-';

  return (
    <div {...stylex.props(styles.statGrid)}>
      <StatCard icon="spark" value={String(visitsThisMonth)} label={t('stats.visitsThisMonth')} />
      <StatCard icon="check" value={String(member.totalVisits)} label={t('stats.totalVisits')} />
      <StatCard icon="calendar" value={lastVisit} label={t('stats.lastVisit')} small />
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
    <Card padding="none" xstyle={styles.card}>
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
    <Card padding="none" xstyle={styles.cardTight}>
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

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

/** Profile — read-only personal details, emergency contact and medical notes. */
function ProfilePanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  const genderLabel = member.gender ? t(`gender.${member.gender}`) : '-';
  return (
    <div {...stylex.props(styles.panelStack)}>
      <Card padding="none" xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.basicInformation')}</h3>
        <div {...stylex.props(styles.fieldGrid)}>
          <FieldRow label={t('detail.fullName')} value={dash(member.name)} />
          <FieldRow label={t('detail.email')} value={dash(member.email)} />
          <FieldRow label={t('detail.phone')} value={dash(member.phone)} />
          <FieldRow
            label={t('detail.dateOfBirth')}
            value={member.dateOfBirth ? formatDate(member.dateOfBirth, locale) : '-'}
          />
          {/*
            The day the membership was recorded as beginning — a fact on the
            profile, corrected through the edit form like any other.

            `detail.membershipStart`, NOT `detail.startDate`: that key belongs to
            the plan card's current-period start, which is a billing anchor and a
            different number. Two rows a tab apart both reading "Start date" would
            be read as the same thing, and they are not.

            A dash is the honest answer for the many memberships that predate the
            field, and needs no apology beside it.
          */}
          <FieldRow
            label={t('detail.membershipStart')}
            value={member.startDate ? formatDate(member.startDate, locale) : '-'}
          />
          <FieldRow label={t('detail.personalId')} value={dash(member.personalId)} />
          <FieldRow label={t('detail.gender')} value={genderLabel} />
          <FieldRow label={t('detail.address')} value={dash(member.address)} />
        </div>
      </Card>

      <Card padding="none" xstyle={styles.card}>
        <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.emergencyContact')}</h3>
        <div {...stylex.props(styles.fieldGrid)}>
          <FieldRow label={t('detail.contactName')} value={dash(member.emergencyContactName)} />
          <FieldRow label={t('detail.contactPhone')} value={dash(member.emergencyContactPhone)} />
        </div>
      </Card>

      <Card padding="none" xstyle={styles.cardTight}>
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
    <Card padding="none" xstyle={styles.card}>
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
    <Card padding="none" xstyle={styles.card}>
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
      <Card padding="none" xstyle={styles.cardTight}>
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
    <Card padding="none" xstyle={styles.card}>
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
          {createNumberFormat(defaultLocale, { maximumFractionDigits: 0 }).format(
            plan.priceAmount / 100,
          )}
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
        {/* Header off: the line above already states the renewal date and the
            days left, which is more than a bare `n/m` could carry. */}
        <Meter value={pct} max={100} label={t('detail.periodProgress')} showHeader={false} />
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
          <Button
            variant="secondary"
            size="inline"
            icon={<Icon name="spark" {...stylex.props(styles.kitGlyph)} />}
            onClick={resume}
            disabled={!canManageBilling}
            loading={pending}
            label={pending ? t('form.saving') : t('detail.resume')}
          />
        ) : (
          <Button
            variant="secondary"
            size="inline"
            icon={<Icon name="clock" {...stylex.props(styles.kitGlyph)} />}
            onClick={() => setOpen(true)}
            disabled={!canFreeze || pending}
            title={canFreeze ? undefined : t('detail.freezeUnavailable')}
            label={t('detail.freeze')}
          />
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('detail.freezeModalTitle')}
        description={t('detail.freezeModalBody', { days: remaining })}
        actions={
          <>
            <Button
              variant="ghost"
              size="block"
              onClick={() => setOpen(false)}
              disabled={pending}
              label={t('actions.cancel')}
            />
            <Button
              variant="primary"
              size="block"
              onClick={submitFreeze}
              loading={pending}
              label={pending ? t('form.saving') : t('detail.freezeConfirm')}
            />
          </>
        }
      >
        <Field
          label={t('detail.freezeDurationLabel')}
          hint={t('detail.freezeDurationHint')}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.min(remaining || MAX_FREEZE_DURATION_DAYS, MAX_FREEZE_DURATION_DAYS)}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
      </Dialog>
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
    <Card padding="none" xstyle={styles.card}>
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
        <Button
          variant="secondary"
          size="inline"
          icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
          onClick={() => setOpen(true)}
          disabled={!canBuy || pending}
          title={canBuy ? undefined : t('detail.noCreditPacksOnSale')}
          label={t('detail.addCredit')}
        />
      ) : null}

      <Dialog
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={t('detail.addCreditModalTitle')}
        description={t('detail.addCreditModalBody')}
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
              <Button
                variant="primary"
                size="inline"
                onClick={() => grant(pack)}
                disabled={pending}
                loading={grantingId === pack.id}
                label={grantingId === pack.id ? t('form.saving') : t('detail.sell')}
              />
            </li>
          ))}
        </ul>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Payments / Invoices / Purchases / Access Log                      */
/* ------------------------------------------------------------------ */

/** Payments — the member's captured / declined charges, newest first. */
function PaymentsPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      <Card padding="none" xstyle={styles.card}>
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
    </div>
  );
}

/** Invoices — the member's numbered invoices (status + PDF download), newest first. */
function InvoicesPanel({ member, t, locale }: { member: MemberDetail; t: T; locale: string }) {
  return (
    <div {...stylex.props(styles.panelStack)}>
      <Card padding="none" xstyle={styles.card}>
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
                    action — a plain <a> so the browser handles the file download,
                    which is also why the basePath has to be added by hand. */}
                <a
                  href={adminPath(`/payments/invoices/${invoice.id}/pdf`)}
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
    <Card padding="none" xstyle={styles.card}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.purchaseHistory')}</h3>
      <ul {...stylex.props(styles.list)}>
        {member.purchases.map((purchase) => {
          const items = purchase.items
            .map((item) => (item.qty > 1 ? `${item.label} ×${item.qty}` : item.label))
            .join(', ');
          return (
            <li key={purchase.id} {...stylex.props(styles.row)}>
              <div {...stylex.props(styles.rowMin)}>
                <p {...stylex.props(styles.rowTitleTrunc)}>{items || '-'}</p>
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
    <Card padding="none" xstyle={styles.card}>
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
/*  Notes                                                              */
/* ------------------------------------------------------------------ */

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
    <Card padding="none" xstyle={[styles.card, styles.notesFill]}>
      <h3 {...stylex.props(styles.sectionLabel)}>{t('detail.staffNotes')}</h3>

      <div {...stylex.props(styles.addForm)}>
        <TextareaField
          label={t('detail.addNote')}
          labelHidden
          rows={3}
          placeholder={t('detail.addNotePlaceholder')}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div {...stylex.props(styles.addFormActions)}>
          <Button
            variant="primary"
            size="inline"
            icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
            onClick={submit}
            disabled={!body.trim()}
            loading={pending}
            label={pending ? t('form.saving') : t('detail.addNote')}
          />
        </div>
      </div>

      {notes.length === 0 ? (
        <p {...stylex.props(styles.mutedText)}>{t('detail.noNotes')}</p>
      ) : (
        <div {...stylex.props(styles.notesScroll)}>
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
