import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  roleHasPermission,
  type CreditPackCatalogueEntry,
  type CreditPackSummary,
  type MemberDetail,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchCreditPackCatalogue, fetchMember, fetchMemberCreditPacks } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Btn, Icon, type IconName, type Tone } from '@/components/ui';
import { MemberActions } from './member-actions';
import { MemberTabs } from './member-tabs';

/** Translator for the `admin.members` namespace (from `getTranslations`). */
type T = Awaited<ReturnType<typeof getTranslations>>;

export const metadata: Metadata = {
  title: 'Member — Fit Admin',
};

// The detail reflects live member state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills; labels come from `status.<value>`. */
const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'success',
  INVITED: 'ink',
  SUSPENDED: 'warning',
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  topRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbLink: {
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  identityCard: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'space-between',
    },
    gap: '1rem',
    padding: '1.25rem',
  },
  identityLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  identityAvatar: {
    display: 'flex',
    height: '4rem',
    width: '4rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontSize: '1.25rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  identityCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  name: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaMono: {
    fontFamily: 'var(--font-family-code)',
  },
  kpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  kpiIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  kpiIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** Format a minor-unit amount as a Georgian Lari (or currency) amount. */
function formatAmount(minorUnits: number, currency: string): string {
  const symbol = currency === 'GEL' ? '₾' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${(minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** "March 2025" from an ISO instant, or an em dash when absent/invalid. */
function formatMonthYear(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render a member's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The NEXT-BILLING KPI value — a date, "Paused", "Overdue", or an em dash. */
function nextBillingKpi(member: MemberDetail, t: T, locale: string): string {
  switch (member.billingState) {
    case 'paused':
      return t('detail.nextBillingPaused');
    case 'overdue':
      return t('detail.nextBillingOverdue');
    case 'due':
      return formatDate(member.nextBillingAt, locale);
    case 'none':
    default:
      return '—';
  }
}

/** One detail KPI card — icon tile, headline value, label, and sub-context. */
function DetailKpi({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: IconName;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>{value}</p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/**
 * The member detail page (T4.2), rebuilt on Astryx Card/Badge + brand-tokened
 * StyleX (T11.19): a breadcrumb + Message action, a back link, an identity header
 * card, four live KPI cards (lifetime value / total visits / member since / next
 * billing), and the Overview/Subscriptions/Bookings/Payments/Notes tabs. Every
 * figure comes from the enriched `GET /members/:id` (real tenant-scoped queries).
 * A `404` from the API — unknown or cross-tenant id — becomes Next's `notFound()`;
 * any other failure surfaces inline so the staff member sees why.
 */
export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('admin.members');
  const locale = await getLocale();

  let member: MemberDetail;
  try {
    member = await fetchMember(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadMember', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/members" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          {t('nav.backToMembers')}
        </Link>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const statusTone: Tone = STATUS_TONES[member.status] ?? 'ink';
  const statusLabel = member.status in STATUS_TONES ? t(`status.${member.status}`) : member.status;

  // Write controls (edit + deactivate) are a `MemberWrite` capability — shown only
  // to staff who hold it, and re-checked by the actions and the API behind them.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);
  // Freezing / resuming a membership is a billing capability (the freeze endpoints
  // sit behind `BillingManage`), distinct from the `MemberWrite` roster edit above.
  const canManageBilling =
    session !== null && roleHasPermission(session.role, Permission.BillingManage);
  // Billing-read staff also see the member's credit balance and (when they can
  // manage billing) the "Add credit" purchase modal. These are secondary to the
  // member detail, so a failure degrades to an empty balance / no catalogue rather
  // than failing the whole page.
  const canReadBilling =
    session !== null && roleHasPermission(session.role, Permission.BillingRead);
  let creditPacks: CreditPackSummary[] = [];
  let creditCatalogue: CreditPackCatalogueEntry[] = [];
  if (canReadBilling) {
    [creditPacks, creditCatalogue] = await Promise.all([
      fetchMemberCreditPacks(member.id)
        .then((r) => r.packs)
        .catch(() => [] as CreditPackSummary[]),
      fetchCreditPackCatalogue()
        .then((r) => r.packs)
        .catch(() => [] as CreditPackCatalogueEntry[]),
    ]);
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.topRow)}>
        <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
          <span>Iron Gym</span>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <Link href="/members" {...stylex.props(styles.crumbLink)}>
            {t('breadcrumb.members')}
          </Link>
          <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
          <span {...stylex.props(styles.crumbCurrent)}>{member.name}</span>
        </nav>
        <Btn v="outline" size="sm" icon="message" disabled>
          {t('detail.message')}
        </Btn>
      </div>

      <Link href="/members" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        {t('nav.backToMembers')}
      </Link>

      {/* Identity header card. */}
      <Card variant="default" padding={0} xstyle={styles.identityCard}>
        <div {...stylex.props(styles.identityLeft)}>
          <span {...stylex.props(styles.identityAvatar)}>{initialsOf(member.name)}</span>
          <div {...stylex.props(styles.identityCol)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.name)}>{member.name}</h1>
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {member.plan ? <Badge tone="brand">{member.plan.name}</Badge> : null}
            </div>
            <div {...stylex.props(styles.metaRow)}>
              <span {...stylex.props(styles.metaMono)}>ID {member.id.slice(0, 8)}</span>
              <span aria-hidden>·</span>
              <span>{member.email}</span>
              {member.phone ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{member.phone}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {canWrite ? <MemberActions memberId={member.id} status={member.status} /> : null}
      </Card>

      {/* Four live KPI cards. */}
      <section aria-label={t('detail.memberMetrics')} {...stylex.props(styles.kpiGrid)}>
        <DetailKpi
          label={t('detail.lifetimeValue')}
          value={formatAmount(member.lifetimeValue, member.currency)}
          context={t('detail.capturedPayments')}
          icon="card"
        />
        <DetailKpi
          label={t('detail.totalVisits')}
          value={String(member.totalVisits)}
          context={t('detail.allTimeCheckins')}
          icon="check"
        />
        <DetailKpi
          label={t('detail.memberSince')}
          value={formatMonthYear(member.joinedAt, locale)}
          context={t('detail.joined', { date: formatDate(member.joinedAt, locale) })}
          icon="calendar"
        />
        <DetailKpi
          label={t('detail.nextBilling')}
          value={nextBillingKpi(member, t, locale)}
          context={member.plan ? member.plan.name : t('detail.noLivePlan')}
          icon="clock"
        />
      </section>

      <MemberTabs
        member={member}
        canManageBilling={canManageBilling}
        creditPacks={creditPacks}
        creditCatalogue={creditCatalogue}
      />
    </div>
  );
}
