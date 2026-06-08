import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSubscriptionPlan } from '@/lib/api';
import { formatPrice, intervalLabel, intervalSuffix } from '../format';
import { PlanActions } from './plan-actions';

export const metadata: Metadata = {
  title: 'Subscription plan — Fit Admin',
};

// The detail reflects live plan state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The subscription-plan detail page (T8.2). Server-fetches
 * `GET /admin/subscriptions/:id` and renders the identity header (name + status +
 * popular badge), the price with its renewal cadence, the description, and the
 * features list, plus the write controls for `BillingManage` staff. A `404` from
 * the API — unknown or cross-tenant id — becomes Next's `notFound()`; any other
 * failure surfaces inline.
 */
export default async function SubscriptionPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let plan;
  try {
    plan = await fetchSubscriptionPlan(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this subscription plan (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/subscriptions"
          className="text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          ← Back to subscriptions
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[plan.status] ?? {
    label: plan.status,
    className: 'bg-slate-100 text-slate-600',
  };

  // Write controls (edit + deactivate) are a `BillingManage` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/subscriptions"
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to subscriptions
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h1>
            <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
            {plan.popular ? (
              <span className="rounded-card bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                Most popular
              </span>
            ) : null}
          </div>
          <p className="text-lg font-semibold tabular-nums text-slate-800">
            {formatPrice(plan.priceAmount, plan.currency)}{' '}
            <span className="text-sm font-normal text-slate-400">
              {intervalSuffix(plan.interval)}
            </span>
          </p>
        </div>
        {canWrite ? <PlanActions planId={plan.id} status={plan.status} /> : null}
      </header>

      <section className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Billing</span>
          <span className="text-slate-800">{intervalLabel(plan.interval)}</span>
        </div>
      </section>

      {plan.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">Description</h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-slate-700">{plan.description}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Features</h2>
        {plan.features.length > 0 ? (
          <ul className="flex max-w-xl list-disc flex-col gap-1 pl-5 text-sm text-slate-700">
            {plan.features.map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No features listed.</p>
        )}
      </section>

      <p className="text-xs text-slate-400">Added {formatDate(plan.createdAt)}.</p>
    </div>
  );
}
