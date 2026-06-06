import type { Metadata } from 'next';
import { listAuditLogQuerySchema, type ListAuditLogQuery } from '@fit/types';
import { ApiError, fetchAuditLogs } from '@/lib/api';
import { AuditLogFilters } from './audit-log-filters';
import { AuditLogTable } from './audit-log-table';

export const metadata: Metadata = {
  title: 'Audit log — Fit Admin',
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
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit log</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          A record of privileged actions taken on your gym — owner impersonation and status changes.
          Filter by action or narrow to a date range.
        </p>
      </header>

      <AuditLogFilters action={query.action ?? ''} from={query.from ?? ''} to={query.to ?? ''} />

      {content}
    </div>
  );
}
