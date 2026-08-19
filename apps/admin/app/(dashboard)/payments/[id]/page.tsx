import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSubscriptionPlan } from '@/lib/api';
import { Badge, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { creditsLabel, formatPrice, intervalLabel, intervalSuffix } from '../format';
import { PlanActions } from './plan-actions';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

export const metadata: Metadata = {
  title: 'Subscription plan - FormaCore Admin',
};

// The detail reflects live plan state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '-'
    : createDateTimeFormat(defaultLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
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
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/payments"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" /> Back to subscriptions
        </Link>
        <p
          role="alert"
          className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
        >
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[plan.status] ?? {
    label: plan.status,
    tone: 'ink' as BadgeTone,
  };

  // Write controls (edit + deactivate) are a `BillingManage` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/payments"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" /> Back to subscriptions
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              {plan.name}
            </h1>
            <Badge tone={status.tone} label={status.label} />
            {plan.popular ? <Badge tone="accent" label="Most popular" /> : null}
          </div>
          <p className="font-mono text-lg font-semibold tabular-nums text-ink-800 dark:text-ink-100">
            {formatPrice(plan.priceAmount, plan.currency)}{' '}
            <span className="text-sm font-normal text-ink-400">
              {intervalSuffix(plan.interval)}
            </span>
          </p>
        </div>
        {canWrite ? <PlanActions planId={plan.id} status={plan.status} /> : null}
      </header>

      <section className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Billing
          </span>
          <span className="text-ink-800 dark:text-ink-100">{intervalLabel(plan.interval)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Credits
          </span>
          <span className="text-ink-800 dark:text-ink-100">
            {creditsLabel(plan.includedCredits)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Freeze allowance
          </span>
          <span className="text-ink-800 dark:text-ink-100">
            {plan.freezeDaysPerPeriod > 0
              ? `${plan.freezeDaysPerPeriod} days / period`
              : 'No freezing'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Free trial
          </span>
          <span className="text-ink-800 dark:text-ink-100">
            {plan.trialDays > 0 ? `${plan.trialDays} days` : 'No trial'}
          </span>
        </div>
      </section>

      {plan.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">
            Description
          </h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">
            {plan.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-ink-500 dark:text-ink-400">Features</h2>
        {plan.features.length > 0 ? (
          <ul className="flex max-w-xl list-disc flex-col gap-1 pl-5 text-sm text-ink-700 dark:text-ink-200">
            {plan.features.map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-400">No features listed.</p>
        )}
      </section>

      <p className="text-xs text-ink-400">Added {formatDate(plan.createdAt)}.</p>
    </div>
  );
}
