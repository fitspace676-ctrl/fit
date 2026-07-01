import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { Badge, Card, Icon, type Tone } from '@/components/ui';
import { MemberActions } from './member-actions';
import { MemberTabs } from './member-tabs';

export const metadata: Metadata = {
  title: 'Member — Fit Admin',
};

// The detail reflects live member state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'ink' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** A labelled summary cell for the overview header. */
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-ink-900 dark:text-white">{value}</dd>
    </Card>
  );
}

/**
 * The member detail page (T4.2). Server-fetches `GET /members/:id` and renders
 * the identity header, the summary cards (the "Overview" surface), and the client
 * {@link MemberTabs} for the history (Subscriptions / Bookings / Payments /
 * Notes). A `404` from the API — unknown or cross-tenant id — becomes Next's
 * `notFound()`; any other failure surfaces inline so the staff member sees why.
 */
export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let member;
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
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to members
        </Link>
        <Card className="flex items-start gap-3 bg-danger-50 p-4 dark:bg-danger-500/10">
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
  };

  // Write controls (edit + deactivate) are a `MemberWrite` capability — shown only
  // to staff who hold it, and re-checked by the actions and the API behind them.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/members"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to members
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              {member.name}
            </h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-sm text-ink-500 dark:text-ink-400">{member.email}</p>
        </div>
        {canWrite ? <MemberActions memberId={member.id} status={member.status} /> : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Phone" value={member.phone ?? '—'} />
        <SummaryCard label="Plan" value={member.planName ?? '—'} />
        <SummaryCard label="Member since" value={formatDate(member.joinedAt)} />
        <SummaryCard label="Next billing" value={formatDate(member.nextBillingAt)} />
      </dl>

      <MemberTabs member={member} />
    </div>
  );
}
