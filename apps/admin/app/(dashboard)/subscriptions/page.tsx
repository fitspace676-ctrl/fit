import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSubscriptionPlans } from '@/lib/api';
import { BillingPlansView } from './billing-plans-view';

export const metadata: Metadata = {
  title: 'Billing · Plans — Fit Admin',
  description:
    'The gym’s recurring membership plans: pricing, renewal cadence, perks and live subscriber counts, with active/archived plans and a live MRR summary.',
};

// The plans board reflects live tenant state (plan catalogue + live subscriber
// counts) and the staff session token, so it must never be statically rendered or
// cached.
export const dynamic = 'force-dynamic';

/**
 * How many plans a single request loads. The billing-plans screen renders every
 * plan as a card (no pagination in the design) and totals subscriber counts / MRR
 * across the whole catalogue, so it pulls the full set in one call. `100` is the
 * API's page cap and is far above any realistic per-gym plan count; the empty
 * state and the segment counts still hold if a gym somehow exceeds it (only the
 * overflow tail would be omitted — vanishingly unlikely for membership plans).
 */
const PLANS_PAGE_LIMIT = 100;

/**
 * The billing-plans board (T5.1), rebuilt to the formacore `billing-plans`
 * artboard. Server-renders the gym's full plan catalogue from
 * `GET /admin/subscriptions` — pricing, renewal cadence, perks and each plan's
 * live subscriber count — and hands it to the client board, which lays the plans
 * out as cards, splits them into Active / Archived, totals the KPI strip
 * (active plans, subscribers, MRR, avg per member) and toggles a plan live/archived
 * inline. The `/subscriptions` route already requires staff (middleware) and the
 * API enforces `BillingRead`, so the only failure handled here is the API call
 * itself. "New plan" / "Edit" and the archive toggle are `BillingManage`, resolved
 * here and passed down so lower-privileged staff see a read-only board.
 */
export default async function BillingPlansPage() {
  const t = await getTranslations('admin.billingPlans');

  // Writes (create, edit, archive/restore) are a `BillingManage` capability; a
  // `BillingRead`-only role sees the board without the toggle or the edit/new
  // affordances. The API re-checks the capability regardless.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  let content;
  try {
    // No status filter: pull both active and archived so the segment counts and the
    // KPI totals describe the whole catalogue, not one bucket.
    const result = await fetchSubscriptionPlans({
      limit: PLANS_PAGE_LIMIT,
      sort: 'name',
      dir: 'asc',
    });
    content = <BillingPlansView plans={result.data} canWrite={canWrite} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('loadError', { status: error.status, message: error.message })
        : t('apiUnreachable');
    content = (
      <p
        role="alert"
        className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-sm text-danger-700 dark:text-danger-300"
      >
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      {content}
    </div>
  );
}
