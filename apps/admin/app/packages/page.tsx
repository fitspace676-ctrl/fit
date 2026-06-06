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
import { PackagePlansFilters } from './packages-filters';
import { PackagePlansTable } from './packages-table';

export const metadata: Metadata = {
  title: 'Packages — Fit Admin',
  description:
    'The gym’s personal-training package plans: search, filter, sort, open a plan, or add and edit plans with pricing, billing cadence, sessions, and features.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The package-plans roster (T4.11). Server-renders one filtered, server-paginated
 * page of `GET /admin/packages` from the URL search params and hands it to the
 * client table (sort links) and the client filters (search + status). The
 * `/packages` route already requires staff (middleware) and the API enforces
 * `PackageRead`, so the only failure handled here is the API call itself.
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

  // "New plan" is a `PackageWrite` capability — shown only to staff who hold it.
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
        sort={query.sort}
        dir={query.dir}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load package plans (${error.status}): ${error.message}`
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Packages</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s personal-training package plans. Search by name or description, filter by
            status, sort any column, open a plan, or add a new one with pricing, a billing cadence,
            sessions, and features.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/packages/new"
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New plan
          </Link>
        ) : null}
      </header>

      <PackagePlansFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
