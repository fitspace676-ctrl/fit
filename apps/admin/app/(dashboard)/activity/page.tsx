import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  listActivityQuerySchema,
  listAuditLogQuerySchema,
  type ListActivityQuery,
  type ListAuditLogQuery,
} from '@fit/types';
import { ApiError, fetchActivity, fetchAuditLogs } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
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

/** A localized error card, shared by both tabs' API-failure paths. */
function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
      <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300" />
      <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            {tab === 'audit' ? t('audit.subtitle') : t('subtitle')}
          </p>
        </div>
        {tab === 'feed' ? (
          <span className="ml-auto inline-flex h-8 shrink-0 items-center gap-2 rounded-pill bg-success-50 px-3 text-xs font-bold text-success-700 ring-1 ring-inset ring-success-500/25 dark:bg-success-500/12 dark:text-success-200 dark:ring-success-400/30">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
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
    <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-6">
      <AuditFilters action={query.action ?? ''} from={query.from ?? ''} to={query.to ?? ''} />
      {content}
    </div>
  );
}
