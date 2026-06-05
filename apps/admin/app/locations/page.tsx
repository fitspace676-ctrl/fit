import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminLocationsQuerySchema,
  roleHasPermission,
  type ListAdminLocationsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLocations } from '@/lib/api';
import { LocationsFilters } from './locations-filters';
import { LocationsTable } from './locations-table';

export const metadata: Metadata = {
  title: 'Locations — Fit Admin',
  description:
    'The gym’s locations (branches): search, filter, sort, open a branch, add or edit locations with hours and amenities.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The locations roster (T4.5). Server-renders one filtered, server-paginated page
 * of `GET /admin/locations` from the URL search params and hands it to the client
 * table (sort links) and the client filters (search + status). The `/locations`
 * route already requires staff (middleware) and the API enforces `LocationRead`,
 * so the only failure handled here is the API call itself.
 */
export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminLocationsQuerySchema.safeParse(raw);
  const query: ListAdminLocationsQuery = parsed.success
    ? parsed.data
    : listAdminLocationsQuerySchema.parse({});

  // "New location" is a `LocationWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  let content;
  try {
    const result = await fetchLocations(query);
    content = (
      <LocationsTable
        locations={result.data}
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
        ? `Could not load locations (${error.status}): ${error.message}`
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Locations</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s branches. Search by name or address, filter by status, sort any column, open
            a branch, or add a new location with opening hours and amenities.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/locations/new"
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New location
          </Link>
        ) : null}
      </header>

      <LocationsFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
