import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listMembersQuerySchema,
  roleHasPermission,
  type ListMembersQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMembers } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { MembersTable } from './members-table';

export const metadata: Metadata = {
  title: 'Members — Fit Admin',
  description: 'The gym member roster: plan mix, search, filter, sort, open a profile, and export.',
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
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbCurrent: {
    color: 'var(--color-text-primary)',
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
 * The members roster (T4.2), rebuilt on Astryx + brand-tokened StyleX (T11.19):
 * a breadcrumb + "Add member" accent button, an "N total · N active" subtitle,
 * a gym-wide plan-mix bar, segmented tabs-with-counts, search + filter, and the
 * enriched table (plan / status / last visit / next billing per row). Server-
 * renders one filtered, server-paginated page of `GET /members` (now carrying
 * `planMix` + tab `counts`) and hands it to the client table. The whole `/members`
 * route already requires `MemberRead` staff (middleware + the API guards), so the
 * only failure handled here is the API call itself.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('admin.members');
  const raw = await searchParams;
  // The same schema the API validates with — coerces page/limit, applies defaults,
  // and drops anything malformed so a hand-edited URL can't break the page.
  const parsed = listMembersQuerySchema.safeParse(raw);
  const query: ListMembersQuery = parsed.success ? parsed.data : listMembersQuerySchema.parse({});

  // "Add member" is a `MemberWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.MemberWrite);

  let subtitle = t('list.subtitle');
  let content;
  try {
    const result = await fetchMembers(query);
    const { all, active } = result.counts;
    subtitle = all === 0 ? t('list.subtitleEmpty') : t('list.subtitleCounts', { all, active });
    content = (
      <MembersTable
        members={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        planMix={result.planMix}
        counts={result.counts}
        sort={query.sort}
        dir={query.dir}
        search={query.search ?? ''}
        status={query.status ?? ''}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? t('errors.loadMembers', { status: error.status, message: error.message })
        : t('errors.apiUnreachable');
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
      <nav aria-label={t('breadcrumb.label')} {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{t('breadcrumb.members')}</span>
      </nav>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>{t('list.title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{subtitle}</p>
        </div>
        {canWrite ? (
          <Link href="/members/new" {...stylex.props(styles.addBtn)}>
            <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
            {t('list.addMember')}
          </Link>
        ) : null}
      </header>

      {content}
    </div>
  );
}
