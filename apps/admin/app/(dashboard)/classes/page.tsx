import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminClassTypesQuerySchema,
  roleHasPermission,
  type ListAdminClassTypesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTypes } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { ClassTypesFilters } from './classes-filters';
import { ClassTypesTable } from './class-types-table';
import { AddClassTypeDrawer } from './add-class-type-drawer';
import { loadRelationOptions } from './options';

export const metadata: Metadata = {
  title: 'Class Types - Fit Admin',
  description:
    'The gym’s reusable class types: search, filter, sort, or add a new kind of class (Boxing, CrossFit) with capacity, duration, pricing, and a colour - the catalogue the schedule places occurrences of.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The class-types roster (the Classes hub's first tab). Server-renders one
 * filtered, server-paginated page of `GET /admin/class-types` from the URL search
 * params and hands it to the client table (sort links) and the client filters
 * (search + status). The `/classes` route already requires staff (middleware) and
 * the API enforces `ClassRead`, so the only failure handled here is the API call.
 */
export default async function ClassTypesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminClassTypesQuerySchema.safeParse(raw);
  const query: ListAdminClassTypesQuery = parsed.success
    ? parsed.data
    : listAdminClassTypesQuerySchema.parse({});

  // "New class type" is a `ClassWrite` capability — shown only to staff who hold
  // it. Its drawer form needs the gym's membership plans for the "included in
  // these plans" pricing select, so load them only when the button shows.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ClassWrite);
  const relationOptions = canWrite ? await loadRelationOptions() : null;

  let content;
  try {
    const result = await fetchClassTypes(query);
    content = (
      <ClassTypesTable
        types={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        sort={query.sort}
        dir={query.dir}
        plans={relationOptions?.plans ?? []}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load class types (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card variant="default" padding={0} xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <p role="alert" {...stylex.props(styles.errorText)}>
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Classes</h1>
          <p {...stylex.props(styles.subtitle)}>
            Your gym’s reusable class types. Search by name, filter by status, sort any column, or
            add a new kind of class with capacity, duration, pricing, and a colour — the catalogue
            the schedule then places occurrences of.
          </p>
        </div>
        {canWrite && relationOptions ? <AddClassTypeDrawer plans={relationOptions.plans} /> : null}
      </header>

      <ClassesTabs />

      <ClassTypesFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
