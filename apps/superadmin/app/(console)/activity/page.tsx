import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { listAdminAuditLogQuerySchema } from '@fit/types';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchAuditLogs, fetchGyms } from '@/lib/api';
import { ButtonLink } from '@/components/button-link';
import { PageHead, SurfaceButton } from '@/components/ops';
import { ActivityFilters, ActivityTable } from './activity-table';

export const metadata: Metadata = {
  title: 'Activity | FormaCore SuperAdmin',
  description: 'Every privileged action taken on the platform, newest first.',
};

// The trail is live and read with the operator's token — never cached.
export const dynamic = 'force-dynamic';

/** How many entries a page holds. Server-enforced; the trail is unbounded. */
const PAGE_SIZE = 25;

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '72rem',
    minWidth: 0,
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  count: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** Build this page's own URL with one filter changed. */
function hrefWith(current: { action?: string; gymId?: string; page?: number }, page: number) {
  const params = new URLSearchParams();
  if (current.action) params.set('action', current.action);
  if (current.gymId) params.set('gymId', current.gymId);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/activity?${query}` : '/activity';
}

/**
 * The platform's audit trail.
 *
 * Everything privileged the operator console can do writes here — creating a
 * gym, suspending one, asking for an impersonation code, and a session actually
 * being minted from one. This screen is the reason those rows are written: a
 * trail nobody can read is a log file, not an audit.
 *
 * Filtering and paging navigate URLs, not local filtered state. The whole screen is
 * server-rendered from the query string, so a filtered view is a URL an operator
 * can keep, share, or land on from a gym's detail screen — and the browser's back
 * button does the obvious thing.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  // Parse with the API's own schema so the console cannot ask for something the
  // API would refuse; anything malformed in the URL falls back to the defaults
  // rather than erroring — a hand-edited query string is not an incident.
  const parsed = listAdminAuditLogQuerySchema.safeParse({ ...raw, limit: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, limit: PAGE_SIZE };
  const active = {
    action: 'action' in query ? query.action : undefined,
    gymId: 'gymId' in query ? query.gymId : undefined,
    page: query.page,
  };

  // Roster failure must not hide the audit trail. The active ID remains clearable.
  const roster = await fetchGyms().catch(() => null);

  let content;
  let pager = null;
  try {
    const { data, total, page } = await fetchAuditLogs(query);
    const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);

    content = <ActivityTable rows={data} />;
    pager = (
      <div {...stylex.props(styles.pager)}>
        <span {...stylex.props(styles.count)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerButtons)}>
          {page > 1 ? (
            <ButtonLink
              href={hrefWith(active, page - 1)}
              label="Previous"
              variant="surface"
              size="inline"
            />
          ) : (
            <SurfaceButton label="Previous" size="inline" disabled />
          )}
          {to < total ? (
            <ButtonLink
              href={hrefWith(active, page + 1)}
              label="Next"
              variant="surface"
              size="inline"
            />
          ) : (
            <SurfaceButton label="Next" size="inline" disabled />
          )}
        </div>
      </div>
    );
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load the trail (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API.'}
      </Banner>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <PageHead
        title="Activity"
        description="Every privileged action taken on the platform, newest first. Impersonation appears twice: once when a code is requested, once when a session is actually opened with it."
      />
      <ActivityFilters
        action={active.action}
        gymId={active.gymId}
        gyms={roster?.gyms.map(({ id, name }) => ({ id, name })) ?? []}
        rosterUnavailable={roster === null}
      />

      {content}
      {pager}
    </div>
  );
}
