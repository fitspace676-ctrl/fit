import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type MemberDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { Badge, Btn, Card, Dot, Icon, type IconName, type Tone } from '@/components/ui';
import { Glyph } from '../glyphs';
import { MemberActions } from './member-actions';
import { MemberTabs } from './member-tabs';

export const metadata: Metadata = {
  title: 'Member — Fit Admin',
};

// The detail reflects live member state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INVITED: { label: 'Trial', tone: 'iris', dot: 'bg-iris-400' },
  SUSPENDED: { label: 'Expired', tone: 'danger', dot: 'bg-danger-400' },
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
function formatMonthYear(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render a member's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** The NEXT-BILLING KPI value — a date, "Paused", "Overdue", or an em dash. */
function nextBillingKpi(member: MemberDetail): string {
  switch (member.billingState) {
    case 'paused':
      return 'Paused';
    case 'overdue':
      return 'Overdue';
    case 'due':
      return formatDate(member.nextBillingAt);
    case 'none':
    default:
      return '—';
  }
}

/** One detail KPI card — toned line icon, headline value, tiny caps label. */
function DetailKpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  /** The icon's text-colour class, per the reference (e.g. `text-success-400`). */
  tone: string;
  icon: IconName;
}) {
  return (
    <Card glow className="flex h-full flex-col p-4 sm:p-5">
      <Icon name={icon} className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
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

  let member: MemberDetail;
  try {
    member = await fetchMember(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this member (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/members"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
          Back to members
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

  const status = STATUS_LABELS[member.status] ?? {
    label: member.status,
    tone: 'ink' as Tone,
    dot: 'bg-ink-400',
  };

  // Write controls (edit + deactivate) are a `MemberWrite` capability — shown only
  // to staff who hold it, and re-checked by the actions and the API behind them.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <Link href="/members" className="hover:text-ink-600 dark:hover:text-ink-300">
            Members
          </Link>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{member.name}</span>
        </nav>
        {/* Messaging isn't wired yet, so the reference's primary Message action stays disabled. */}
        <Btn v="primary" size="sm" icon="message" disabled title="Messaging isn’t wired yet">
          Message
        </Btn>
      </div>

      <Link
        href="/members"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
        Back to members
      </Link>

      {/* Identity header card. */}
      <Card>
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="grid h-24 w-24 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-2xl font-extrabold text-brand-700 ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:bg-brand-500/15 dark:text-brand-200 dark:ring-offset-ink-950">
              {initialsOf(member.name)}
            </span>
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                  {member.name}
                </h1>
                <Badge tone={status.tone}>
                  <Dot c={status.dot} />
                  {status.label}
                </Badge>
                {member.plan ? <Badge tone="iris">{member.plan.name}</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
                <span className="font-mono">ID {member.id.slice(0, 8)}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Glyph name="mail" className="h-3.5 w-3.5" />
                  {member.email}
                </span>
                {member.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Glyph name="phone" className="h-3.5 w-3.5" />
                    {member.phone}
                  </span>
                ) : null}
              </div>
            </div>
            {canWrite ? (
              <div className="flex items-center gap-2.5 sm:pb-1">
                <MemberActions memberId={member.id} status={member.status} />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Four live KPI cards. */}
      <section aria-label="Member metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <DetailKpi
          label="Lifetime value"
          value={formatAmount(member.lifetimeValue, member.currency)}
          tone="text-success-400"
          icon="card"
        />
        <DetailKpi
          label="Total visits"
          value={String(member.totalVisits)}
          tone="text-accent-400"
          icon="qr"
        />
        <DetailKpi
          label="Member since"
          value={formatMonthYear(member.joinedAt)}
          tone="text-iris-400"
          icon="calendar"
        />
        <DetailKpi
          label="Next billing"
          value={nextBillingKpi(member)}
          tone="text-brand-400"
          icon="ticket"
        />
      </section>

      <MemberTabs member={member} canWrite={canWrite} />
    </div>
  );
}
