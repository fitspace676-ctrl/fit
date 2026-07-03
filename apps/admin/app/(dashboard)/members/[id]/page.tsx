import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission, type MemberDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { Badge, Btn, Card, Icon, type IconName, type Tone } from '@/components/ui';
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
    <Card glow className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">{context}</p>
    </Card>
  );
}

/**
 * The member detail page (T4.2), reskinned to the Planflow "formacore" layout:
 * a breadcrumb + Message action, a back link, an identity header card, four live
 * KPI cards (lifetime value / total visits / member since / next billing), and the
 * Overview/Subscriptions/Bookings/Payments/Notes tabs. Every figure comes from the
 * enriched `GET /members/:id` (real tenant-scoped queries). A `404` from the API —
 * unknown or cross-tenant id — becomes Next's `notFound()`; any other failure
 * surfaces inline so the staff member sees why.
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
      <div className="flex flex-col gap-4">
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          {t('nav.backToMembers')}
        </Link>
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={t('breadcrumb.label')}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <Link href="/members" className="hover:text-ink-600 dark:hover:text-ink-300">
            {t('breadcrumb.members')}
          </Link>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{member.name}</span>
        </nav>
        <Btn v="outline" size="sm" icon="message" disabled>
          {t('detail.message')}
        </Btn>
      </div>

      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        {t('nav.backToMembers')}
      </Link>

      {/* Identity header card. */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            {initialsOf(member.name)}
          </span>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                {member.name}
              </h1>
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {member.plan ? <Badge tone="brand">{member.plan.name}</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              <span className="font-mono">ID {member.id.slice(0, 8)}</span>
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
      <section
        aria-label={t('detail.memberMetrics')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
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

      <MemberTabs member={member} canWrite={canWrite} />
    </div>
  );
}
