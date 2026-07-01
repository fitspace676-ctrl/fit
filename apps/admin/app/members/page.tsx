import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listMembersQuerySchema,
  roleHasPermission,
  type ListMembersQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMembers } from '@/lib/api';
import { buttonClasses, Card, Icon } from '@/components/ui';
import { MembersFilters } from './members-filters';
import { MembersTable } from './members-table';

export const metadata: Metadata = {
  title: 'Members — Fit Admin',
  description: 'The gym member roster: search, filter, sort, open a profile, and export.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The members roster (T4.2). Server-renders one filtered, server-paginated page
 * of `GET /members` from the URL search params and hands it to the client table
 * (selection + export + sort links) and the client filters (search + status).
 * The whole `/members` route already requires `MemberRead` staff (middleware +
 * the API guards), so the only failure handled here is the API call itself.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  // The same schema the API validates with — coerces page/limit, applies defaults,
  // and drops anything malformed so a hand-edited URL can't break the page.
  const parsed = listMembersQuerySchema.safeParse(raw);
  const query: ListMembersQuery = parsed.success ? parsed.data : listMembersQuerySchema.parse({});

  // "New member" is a `MemberWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  let content;
  try {
    const result = await fetchMembers(query);
    content = (
      <MembersTable
        members={result.data}
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
        ? `Could not load members (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300" />
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
            Members
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            Every member of your gym. Search by name or email, filter by status, sort any column,
            open a profile, or export a selection to CSV.
          </p>
        </div>
        {canWrite ? (
          <Link href="/members/new" className={buttonClasses('primary', 'md')}>
            <Icon name="plus" className="h-4 w-4" sw={2} />
            New member
          </Link>
        ) : null}
      </header>

      <MembersFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
