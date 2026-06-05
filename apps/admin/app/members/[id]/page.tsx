import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, fetchMember } from '@/lib/api';
import { MemberTabs } from './member-tabs';

export const metadata: Metadata = {
  title: 'Member — Fit Admin',
};

// The detail reflects live member state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INVITED: { label: 'Invited', className: 'bg-slate-100 text-slate-600' },
  SUSPENDED: { label: 'Suspended', className: 'bg-amber-50 text-amber-700' },
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
    <div className="rounded-card border border-slate-100 bg-white px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
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
        <Link href="/members" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to members
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[member.status] ?? {
    label: member.status,
    className: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/members" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to members
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{member.name}</h1>
            <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="text-sm text-slate-500">{member.email}</p>
        </div>
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
