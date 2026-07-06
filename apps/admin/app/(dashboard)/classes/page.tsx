import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminClassTemplatesQuerySchema,
  roleHasPermission,
  type ListAdminClassTemplatesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchClassTemplates } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
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
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  addIcon: {
    width: '1rem',
    height: '1rem',
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
            Your gym’s recurring class templates. Search by title or category, filter by status,
            sort any column, open a template, or add a new one with a visual recurrence editor,
            capacity, duration, and a default trainer and location.
          </p>
        </div>
        {canWrite ? (
          <Link href="/classes/new" {...stylex.props(styles.addBtn)}>
            <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
            New class
          </Link>
        ) : null}
      </header>

      <ClassTemplatesFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
