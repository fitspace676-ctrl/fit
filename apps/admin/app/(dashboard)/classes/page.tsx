import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminClassTypesQuerySchema,
  roleHasPermission,
  type ListAdminClassTypesQuery,
} from '@fit/types';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from '@/lib/session';
import { getActiveLocationId } from '@/lib/active-location-server';
import { ApiError, fetchClassTypes } from '@/lib/api';
import { Icon } from '@/components/ui';
import { ClassesTabs } from '@/components/classes-tabs';
import { ClassTypesFilters } from './classes-filters';
import { ClassTypesTable } from './class-types-table';
import { AddClassTypeDrawer } from './add-class-type-drawer';
import { loadRelationOptions } from './options';

export const metadata: Metadata = {
  title: 'Class Types - FormaCore Admin',
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
  // A quiet strip, not an alert: nothing has gone wrong, the table is simply
  // about a wider population than the switcher suggests. Same surface + hairline
  // treatment as the dashboard's and reports' branch-scope notes, so the console
  // makes this point the same way wherever it has to make it.
  scopeNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  scopeNoteIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    // Optically centred on the first line of text rather than its box top.
    marginTop: '0.1875rem',
    color: 'var(--color-icon-secondary)',
  },
  scopeNoteText: {
    margin: 0,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
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

  // THE TYPE CATALOGUE IS DELIBERATELY NOT FILTERED BY BRANCH.
  //
  // `GET /admin/class-types` takes no `locationId`, and that is a decision rather
  // than a gap (roadmap → exemption register): a `ClassType` carries no location
  // column, so the only branch it could be narrowed by is "a branch it has been
  // scheduled at" — `instances: { some: { locationId } }`. That reading is wrong
  // in both directions. A type created this morning has no occurrences yet, so it
  // would vanish from every branch until first scheduled; and a type run once at
  // branch B would be pinned to B forever. Either way the operator would conclude
  // the catalogue is smaller than it is. It becomes filterable when `ClassType`
  // gains a real branch (Stage 7).
  //
  // So the table stays gym-wide and *says so* — but only while a branch is
  // actually selected, because with "All locations" there is nothing to disclaim.
  const [locationId, tClassTypes] = await Promise.all([
    getActiveLocationId(raw),
    getTranslations('admin.classTypes'),
  ]);

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
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card padding="none" xstyle={styles.errorCard}>
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
            add a new kind of class with capacity, duration, pricing, and a colour - the catalogue
            the schedule then places occurrences of.
          </p>
        </div>
        {canWrite && relationOptions ? <AddClassTypeDrawer plans={relationOptions.plans} /> : null}
      </header>

      <ClassesTabs />

      {locationId !== undefined ? (
        <div role="note" {...stylex.props(styles.scopeNote)}>
          <Icon name="info" aria-hidden {...stylex.props(styles.scopeNoteIcon)} />
          <p {...stylex.props(styles.scopeNoteText)}>{tClassTypes('branchScope')}</p>
        </div>
      ) : null}

      <ClassTypesFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
