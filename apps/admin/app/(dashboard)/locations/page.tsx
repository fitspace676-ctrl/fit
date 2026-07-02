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
import { buttonClasses, Card, Icon } from '@/components/ui';
import { LocationsFilters } from './locations-filters';
import { LocationsGrid } from './locations-table';

export const metadata: Metadata = {
  title: 'Locations — Fit Admin',
  description:
    'The gym’s locations (branches): KPI strip, search + status filter, and an image card per branch with amenities and quick actions.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** KPI icon stroke paths (24×24 grid), lifted from the reference artboard. */
const KPI_PATHS = {
  building:
    'M3 21h18 M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16 M9 7h2 M13 7h2 M9 11h2 M13 11h2 M9 15h2 M13 15h2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M9 12h6',
} as const;

/** One roster KPI card — toned icon, headline value, uppercase label. */
function KpiCard({
  label,
  value,
  tone,
  d,
}: {
  label: string;
  value: number;
  tone: string;
  d: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 ${tone}`}
        aria-hidden
      >
        <path d={d} />
      </svg>
      <div className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </div>
    </Card>
  );
}

/**
 * The locations roster (T4.5), reskinned to the Planflow "formacore" reference:
 * a breadcrumb + "Add location" gradient button, the KPI strip (gym-wide counts),
 * segmented status tabs + search, and an image card per branch. Server-renders one
 * filtered, server-paginated page of `GET /admin/locations` (plus the two status
 * count queries backing the KPIs and tab counts) and hands it to the client grid
 * and filters. The `/locations` route already requires staff (middleware) and the
 * API enforces `LocationRead`, so the only failure handled here is the API call
 * itself.
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

  // "Add location" is a `LocationWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.LocationWrite);

  let subtitle = 'Your gym’s branches.';
  let content;
  try {
    // The filtered page plus two count-only queries for the gym-wide KPI figures
    // (`limit: 1` — only `total` is read), all in parallel.
    const [result, activeCount, inactiveCount] = await Promise.all([
      fetchLocations(query),
      fetchLocations({ status: 'ACTIVE', limit: 1 }),
      fetchLocations({ status: 'INACTIVE', limit: 1 }),
    ]);
    const active = activeCount.total;
    const inactive = inactiveCount.total;
    const all = active + inactive;
    subtitle =
      all === 0
        ? 'No branches yet.'
        : `${all} ${all === 1 ? 'branch' : 'branches'} · ${active} active`;
    content = (
      <>
        <section aria-label="Location metrics" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Locations" value={all} tone="text-brand-400" d={KPI_PATHS.building} />
          <KpiCard label="Active" value={active} tone="text-success-400" d={KPI_PATHS.clock} />
          <KpiCard label="Inactive" value={inactive} tone="text-iris-400" d={KPI_PATHS.archive} />
        </section>

        <LocationsFilters
          search={query.search ?? ''}
          status={query.status ?? ''}
          counts={{ all, active, inactive }}
        />

        <LocationsGrid
          locations={result.data}
          total={result.total}
          page={result.page}
          limit={result.limit}
          canWrite={canWrite}
        />
      </>
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load locations (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
        <Icon
          name="info"
          className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
        />
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
      >
        <span>Iron Gym</span>
        <Icon name="chevronRight" className="h-3.5 w-3.5" />
        <span className="text-ink-600 dark:text-ink-300">Locations</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Locations
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
        </div>
        {canWrite ? (
          <Link href="/locations/new" className={buttonClasses('primary', 'md')}>
            <Icon name="plus" className="h-4 w-4" sw={2} />
            Add location
          </Link>
        ) : null}
      </header>

      {content}
    </div>
  );
}
