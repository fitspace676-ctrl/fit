import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminTrainersQuerySchema,
  roleHasPermission,
  type ListAdminTrainersQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainers } from '@/lib/api';
import { TrainersFilters } from './trainers-filters';
import { TrainersTable } from './trainers-table';

export const metadata: Metadata = {
  title: 'Trainers — Fit Admin',
  description:
    'The gym trainer roster: search, filter, sort, open a profile, add or edit trainers.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The trainers roster (T4.4). Server-renders one filtered, server-paginated page
 * of `GET /admin/trainers` from the URL search params and hands it to the client
 * table (sort links) and the client filters (search + status). The `/trainers`
 * route already requires staff (middleware) and the API enforces `TrainerRead`,
 * so the only failure handled here is the API call itself.
 */
export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminTrainersQuerySchema.safeParse(raw);
  const query: ListAdminTrainersQuery = parsed.success
    ? parsed.data
    : listAdminTrainersQuerySchema.parse({});

  // "New trainer" is a `TrainerWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  let content;
  try {
    const result = await fetchTrainers(query);
    content = (
      <TrainersTable
        trainers={result.data}
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
        ? `Could not load trainers (${error.status}): ${error.message}`
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Trainers</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s trainers. Search by name or headline, filter by status, sort any column, open
            a profile, or add a new trainer with a photo.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/trainers/new"
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New trainer
          </Link>
        ) : null}
      </header>

      <TrainersFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
