import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminClassTemplatesQuerySchema,
  roleHasPermission,
  type ListAdminClassTemplatesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplates } from '@/lib/api';
import { ClassTemplatesFilters } from './classes-filters';
import { ClassTemplatesTable } from './classes-table';

export const metadata: Metadata = {
  title: 'Classes — Fit Admin',
  description:
    'The gym’s recurring class templates: search, filter, sort, open a template, or add and edit classes with a visual recurrence editor, capacity, duration, and a trainer/location.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The class-templates roster (T5.2). Server-renders one filtered, server-paginated
 * page of `GET /admin/classes` from the URL search params and hands it to the
 * client table (sort links) and the client filters (search + status). The
 * `/classes` route already requires staff (middleware) and the API enforces
 * `ClassRead`, so the only failure handled here is the API call itself.
 */
export default async function ClassTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminClassTemplatesQuerySchema.safeParse(raw);
  const query: ListAdminClassTemplatesQuery = parsed.success
    ? parsed.data
    : listAdminClassTemplatesQuerySchema.parse({});

  // "New class" is a `ClassWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);

  let content;
  try {
    const result = await fetchClassTemplates(query);
    content = (
      <ClassTemplatesTable
        templates={result.data}
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
        ? `Could not load class templates (${error.status}): ${error.message}`
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Classes</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s recurring class templates. Search by title or category, filter by status,
            sort any column, open a template, or add a new one with a visual recurrence editor,
            capacity, duration, and a default trainer and location.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/classes/new"
            className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New class
          </Link>
        ) : null}
      </header>

      <ClassTemplatesFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
