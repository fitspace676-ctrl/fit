import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminSubscriptionPlansQuerySchema,
  roleHasPermission,
  type ListAdminSubscriptionPlansQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchSubscriptionPlans } from '@/lib/api';
import { SubscriptionPlansFilters } from './subscriptions-filters';
import { SubscriptionPlansTable } from './subscriptions-table';

export const metadata: Metadata = {
  title: 'Subscriptions — Fit Admin',
  description:
    'The gym’s recurring membership subscription plans: search, filter, sort, open a plan, or add and edit plans with pricing, renewal cadence, and features.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The subscription-plans roster (T8.2). Server-renders one filtered,
 * server-paginated page of `GET /admin/subscriptions` from the URL search params
 * and hands it to the client table (sort links) and the client filters (search +
 * status). The `/subscriptions` route already requires staff (middleware) and the
 * API enforces `BillingRead`, so the only failure handled here is the API call
 * itself.
 */
export default async function SubscriptionPlansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminSubscriptionPlansQuerySchema.safeParse(raw);
  const query: ListAdminSubscriptionPlansQuery = parsed.success
    ? parsed.data
    : listAdminSubscriptionPlansQuerySchema.parse({});

  // "New plan" is a `BillingManage` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  let content;
  try {
    const result = await fetchSubscriptionPlans(query);
    content = (
      <SubscriptionPlansTable
        plans={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        sort={query.sort}
        dir={query.dir}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load subscription plans (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Subscriptions</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s recurring membership plans. Search by name or description, filter by status,
            sort any column, open a plan, or add a new one with pricing, a renewal cadence, and
            features.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/subscriptions/new"
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New plan
          </Link>
        ) : null}
      </header>

      <SubscriptionPlansFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
