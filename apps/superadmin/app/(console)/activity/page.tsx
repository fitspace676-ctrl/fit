import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, listAdminAuditLogQuerySchema } from '@fit/types';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchAuditLogs } from '@/lib/api';
import { ButtonLink } from '@/components/button-link';
import { ActivityTable } from './activity-table';

export const metadata: Metadata = {
  title: 'Activity — FormaCore SuperAdmin',
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
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
 * Filtering and paging are **links**, not client state. The whole screen is
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
              variant="secondary"
              size="inline"
            />
          ) : null}
          {to < total ? (
            <ButtonLink
              href={hrefWith(active, page + 1)}
              label="Next"
              variant="secondary"
              size="inline"
            />
          ) : null}
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
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Activity</h1>
        <p {...stylex.props(styles.subtitle)}>
          Every privileged action taken on the platform, newest first. Impersonation appears twice:
          once when a code is requested, once when a session is actually opened with it.
        </p>
      </header>

      <div {...stylex.props(styles.filters)}>
        <ButtonLink
          href={hrefWith({ gymId: active.gymId }, 1)}
          label="All actions"
          variant={active.action ? 'ghost' : 'primary'}
          size="inline"
        />
        {AUDIT_ACTIONS.map((action) => (
          <ButtonLink
            key={action}
            href={hrefWith({ action, gymId: active.gymId }, 1)}
            label={AUDIT_ACTION_LABELS[action]}
            variant={active.action === action ? 'primary' : 'ghost'}
            size="inline"
          />
        ))}
      </div>

      {content}
      {pager}
    </div>
  );
}
