import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listActivityQuerySchema, type ListActivityQuery } from '@fit/types';
import { ApiError, fetchActivity } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { ActivityFeed } from './activity-feed';
import { ActivityFilters } from './activity-filters';

export const metadata: Metadata = {
  title: 'Activity — Fit Admin',
  description:
    "The gym's unified live event stream: member signups, class bookings, reception check-ins, sales and subscription enrolments.",
};

// The feed reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Activity screen (T3.9). Server-renders one filtered, server-paginated page
 * of `GET /admin/activity` from the URL search params and hands it to the client
 * timeline (pagination) and the client filters (kind + date range). The whole
 * `/activity` route requires `MANAGER`+ staff (middleware) and the API re-gates on
 * `ReportView`, so the only failure handled here is the API call itself.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
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
    const message =
      error instanceof ApiError
        ? t('error', { status: error.status, message: error.message })
        : t('errorUnreachable');
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
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            {t('title')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
        </div>
        <span className="ml-auto inline-flex h-8 shrink-0 items-center gap-2 rounded-pill bg-success-50 px-3 text-xs font-bold text-success-700 ring-1 ring-inset ring-success-500/25 dark:bg-success-500/12 dark:text-success-200 dark:ring-success-400/30">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
          </span>
          {t('live')}
        </span>
      </header>

      <ActivityFilters type={query.type ?? ''} from={query.from ?? ''} to={query.to ?? ''} />

      {content}
    </div>
  );
}
