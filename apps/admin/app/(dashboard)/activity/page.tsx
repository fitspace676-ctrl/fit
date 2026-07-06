import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  listActivityQuerySchema,
  listAuditLogQuerySchema,
  type ListActivityQuery,
  type ListAuditLogQuery,
} from '@fit/types';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { ApiError, fetchActivity, fetchAuditLogs } from '@/lib/api';
import { Icon } from '@/components/ui';
import { ActivityFeed } from './activity-feed';
import { ActivityFilters } from './activity-filters';
import { ActivityTabs } from './activity-tabs';
import { AuditFilters } from './audit-filters';
import { AuditTable } from './audit-table';
import { parseActivityTab } from './tabs';

export const metadata: Metadata = {
  title: 'Activity — Fit Admin',
  description:
    "The gym's unified live event stream and audit trail: member signups, class bookings, reception check-ins, sales and subscription enrolments, plus the log of privileged actions.",
};

// Both feeds reflect live tenant state and the staff session token, so the page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

const ping = stylex.keyframes({
  '75%, 100%': { transform: 'scale(2)', opacity: 0 },
});

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
    gap: '0.75rem',
  },
  headings: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.025em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  liveBadge: {
    marginLeft: 'auto',
    display: 'inline-flex',
    height: '2rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-success)',
    backgroundColor: 'var(--color-success-muted)',
    paddingInline: '0.75rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-success)',
  },
  livePulse: {
    position: 'relative',
    display: 'flex',
    height: '0.5rem',
    width: '0.5rem',
  },
  livePing: {
    position: 'absolute',
    display: 'inline-flex',
    height: '100%',
    width: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success)',
    opacity: 0.75,
    animationName: ping,
    animationDuration: '1s',
    animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
    animationIterationCount: 'infinite',
  },
  liveDot: {
    position: 'relative',
    display: 'inline-flex',
    height: '0.5rem',
    width: '0.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
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

/** A localized error card, shared by both tabs' API-failure paths. */
function ErrorCard({ message }: { message: string }) {
  return (
    <Card variant="default" padding={0} xstyle={styles.errorCard}>
      <Icon name="info" {...stylex.props(styles.errorIcon)} />
      <p role="alert" {...stylex.props(styles.errorText)}>
        {message}
      </p>
    </Card>
  );
}

/**
 * The Activity screen (T3.9) with the audit-log viewer folded in as a tab (T3.10).
 * The `?tab=` param selects the live event **feed** (default) or the privileged-
 * action **audit** log; each tab server-renders one filtered, server-paginated
 * page of its own endpoint from the URL search params and hands it to its client
 * timeline/table + filters. The whole `/activity` route requires `MANAGER`+ staff
 * (middleware) and each API re-gates on its own capability (`ReportView` /
 * `AuditRead`, held by the same roles), so the only failure handled here is the
 * API call itself.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const tab = parseActivityTab(raw.tab);
  const t = await getTranslations('admin.activity');

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headings)}>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
          <p {...stylex.props(styles.subtitle)}>
            {tab === 'audit' ? t('audit.subtitle') : t('subtitle')}
          </p>
        </div>
        {tab === 'feed' ? (
          <span {...stylex.props(styles.liveBadge)}>
            <span {...stylex.props(styles.livePulse)}>
              <span {...stylex.props(styles.livePing)} />
              <span {...stylex.props(styles.liveDot)} />
            </span>
            {t('live')}
          </span>
        ) : null}
      </header>

      <ActivityTabs active={tab} />

      {tab === 'audit' ? <AuditPanel raw={raw} /> : <FeedPanel raw={raw} />}
    </div>
  );
}

/** The live event feed tab: filters + server-paginated timeline. */
async function FeedPanel({ raw }: { raw: SearchParams }) {
  // The same schema the API validates with — coerces page/limit, applies defaults,
  // and drops anything malformed so a hand-edited URL can't break the page.
  const parsed = listActivityQuerySchema.safeParse(raw);
  const query: ListActivityQuery = parsed.success ? parsed.data : listActivityQuerySchema.parse({});
  const t = await getTranslations('admin.activity');

  let content;
  try {
    const result = await fetchActivity(query);
    content = (
      <ActivityFeed
        events={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
      />
    );
  } catch (error) {
    content = (
      <ErrorCard
        message={
          error instanceof ApiError
            ? t('error', { status: error.status, message: error.message })
            : t('errorUnreachable')
        }
      />
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <ActivityFilters type={query.type ?? ''} from={query.from ?? ''} to={query.to ?? ''} />
      {content}
    </div>
  );
}

/** The audit-log tab: filters + server-paginated privileged-action table. */
async function AuditPanel({ raw }: { raw: SearchParams }) {
  const parsed = listAuditLogQuerySchema.safeParse(raw);
  const query: ListAuditLogQuery = parsed.success ? parsed.data : listAuditLogQuerySchema.parse({});
  const t = await getTranslations('admin.activity.audit');

  let content;
  try {
    const result = await fetchAuditLogs(query);
    content = (
      <AuditTable
        entries={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
      />
    );
  } catch (error) {
    content = (
      <ErrorCard
        message={
          error instanceof ApiError
            ? t('error', { status: error.status, message: error.message })
            : t('errorUnreachable')
        }
      />
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <AuditFilters action={query.action ?? ''} from={query.from ?? ''} to={query.to ?? ''} />
      {content}
    </div>
  );
}
