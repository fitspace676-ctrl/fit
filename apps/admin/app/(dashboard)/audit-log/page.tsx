import type { Metadata } from 'next';
import { listAuditLogQuerySchema, type ListAuditLogQuery } from '@fit/types';
import { ApiError, fetchAuditLogs } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { AuditLogFilters } from './audit-log-filters';
import { AuditLogTable } from './audit-log-table';

export const metadata: Metadata = {
  title: 'Activity — Fit Admin',
  description: "The gym's trail of privileged actions: filter by action and date range.",
};

// The trail reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The audit-log viewer (T4.9). Server-renders one filtered, server-paginated page
 * of `GET /audit-logs` from the URL search params and hands it to the client table
 * (pagination) and the client filters (action + date range). The whole
 * `/audit-log` route already requires `AuditRead` staff (middleware + the API
 * guards), so the only failure handled here is the API call itself.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  // The same schema the API validates with — coerces page/limit, applies defaults,
  // and drops anything malformed so a hand-edited URL can't break the page.
  const parsed = listAuditLogQuerySchema.safeParse(raw);
  const query: ListAuditLogQuery = parsed.success ? parsed.data : listAuditLogQuerySchema.parse({});

  let content;
  try {
    const result = await fetchAuditLogs(query);
    content = (
      <AuditLogTable
        entries={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load the audit log (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
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
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Activity
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Everything happening across your gym, as it happens.
          </p>
        </div>
      </header>

      <AuditLogFilters action={query.action ?? ''} from={query.from ?? ''} to={query.to ?? ''} />

      {content}
    </div>
  );
}
