import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminServicesQuerySchema,
  roleHasPermission,
  type ListAdminServicesQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchAdminServices } from '@/lib/api';
import { Icon } from '@/components/ui';
import { ServicesSummary } from './services-summary';
import { ServicesStatusTabs } from './services-status-tabs';
import { ServicesFilters } from './services-filters';
import { ServicesList } from './services-list';
import { ServicesPager } from './services-pager';
import { ServiceDrawer } from './service-drawer';

export const metadata: Metadata = {
  title: 'Services - FormaCore Admin',
  description:
    'The gym’s services: personal training and custom services, who delivers them and what they cost.',
};

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
  headActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  errorIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
  },
});

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Services catalogue (stage 1 of the Services design): one server-paginated
 * page of `GET /admin/services` from the URL search params — summary tiles, the
 * Active / Archived tabs, search + type filter, and the rows with Edit / Archive.
 */
export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminServicesQuerySchema.safeParse(raw);
  const query: ListAdminServicesQuery = parsed.success
    ? parsed.data
    : listAdminServicesQuerySchema.parse({});

  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  let summary = null;
  let content;
  try {
    const result = await fetchAdminServices(query);
    summary = <ServicesSummary summary={result.summary} />;
    content = (
      <>
        <ServicesList services={result.data} canWrite={canWrite} />
        {result.total > result.limit ? (
          <ServicesPager total={result.total} page={result.page} limit={result.limit} />
        ) : null}
      </>
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load services (${error.status}): ${error.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card role="alert" padding="none" xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <span>{message}</span>
      </Card>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Services</h1>
          <p {...stylex.props(styles.subtitle)}>
            Personal training and custom services, who delivers them and what a session costs. Sell
            them at the POS; personal-training slots go on the PT calendar.
          </p>
        </div>
        <div {...stylex.props(styles.headActions)}>
          {canWrite ? <ServiceDrawer mode="create" /> : null}
        </div>
      </header>

      {summary}
      <ServicesStatusTabs status={query.status} />
      <ServicesFilters search={query.search ?? ''} type={query.type ?? ''} />
      {content}
    </div>
  );
}
