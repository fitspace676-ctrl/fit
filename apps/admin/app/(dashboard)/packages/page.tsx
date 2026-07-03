import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminPackagePlansQuerySchema,
  roleHasPermission,
  type ListAdminPackagePlansQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchPackagePlans } from '@/lib/api';
import { Icon, buttonClasses } from '@/components/ui';
import { BillingTabs } from '../subscriptions/billing-tabs';
import { PackagePlansFilters } from './packages-filters';
import { PackagePlansTable } from './packages-table';

export const metadata: Metadata = {
  title: 'Billing · PT packages — Fit Admin',
  description:
    'The gym’s personal-training package plans: search, filter, open a plan, or add and edit plans with pricing, billing cadence, sessions, and features.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The package-plans roster (T4.11), presented as the "PT packages" tab of the
 * reference Billing screen. Server-renders one filtered, server-paginated page
 * of `GET /admin/packages` from the URL search params and hands it to the
 * client card grid (segments + lifecycle switches) and the client search box.
 * The `/packages` route already requires staff (middleware) and the API
 * enforces `PackageRead`, so the only failure handled here is the API call
 * itself.
 */
export default async function PackagePlansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminPackagePlansQuerySchema.safeParse(raw);
  const query: ListAdminPackagePlansQuery = parsed.success
    ? parsed.data
    : listAdminPackagePlansQuerySchema.parse({});

  // "New package" + the lifecycle switches are a `PackageWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.PackageWrite);

  let content;
  try {
    const result = await fetchPackagePlans(query);
    content = (
      <PackagePlansTable
        plans={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        status={query.status ?? ''}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load package plans (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
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
    <div className="flex flex-col gap-5">
      {/* Page header + Billing sub-tabs. */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Billing
          </h1>
          {canWrite ? (
            <Link href="/packages/new" className={buttonClasses('primary', 'sm')}>
              <Icon name="plus" className="h-4 w-4" />
              New package
            </Link>
          ) : null}
        </div>
        <div className="mt-3">
          <BillingTabs active="PT packages" />
        </div>
      </div>

      <PackagePlansFilters search={query.search ?? ''} />

      {content}
    </div>
  );
}
