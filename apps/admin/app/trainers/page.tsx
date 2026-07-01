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
import { buttonClasses, Card, Icon } from '@/components/ui';
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Trainers
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            Your gym’s trainers. Search by name or headline, filter by status, sort any column, open
            a profile, or add a new trainer with a photo.
          </p>
        </div>
        {canWrite ? (
          <Link href="/trainers/new" className={buttonClasses('primary', 'md')}>
            <Icon name="plus" className="h-4 w-4" sw={2} />
            New trainer
          </Link>
        ) : null}
      </header>

      <TrainersFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
