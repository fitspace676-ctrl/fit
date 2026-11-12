import Link from 'next/link';
import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { PageHead, StatCard } from '@/components/ops';
import { Banner } from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchGyms, fetchGymRequests } from '@/lib/api';
import { tenantAdminUrl, tenantPortalUrl } from '@/lib/tenant-url';
import { GymsTable, type GymRow } from './gyms-table';

export const metadata: Metadata = {
  title: 'Gyms | FormaCore SuperAdmin',
  description: 'Every gym on the platform: subdomain, status, owner, and operator actions.',
};

// The roster reflects live tenant state and the operator's session token, so it
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The console's home IS the gym roster — there is no separate landing, because an
 * operator opening this console is always here to look at a tenant.
 *
 * Tenant URLs are resolved HERE rather than in the table: they come from
 * `NEXT_PUBLIC_ROOT_DOMAIN`, and reading configuration is the server's job — the
 * client component then only renders what it was handed. Reaching this page
 * already implies a verified SUPER_ADMIN (`middleware.ts` gates the whole app),
 * so the only failure worth handling is the API call itself.
 */
const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '72rem',
  },
});

export default async function GymsPage() {
  let content;
  try {
    const [{ gyms }, requests] = await Promise.all([
      fetchGyms(),
      fetchGymRequests().catch(() => null),
    ]);
    const rows: GymRow[] = gyms.map((gym) => ({
      ...gym,
      portalUrl: tenantPortalUrl(gym.subdomainSlug),
      adminUrl: tenantAdminUrl(gym.subdomainSlug),
    }));
    const active = gyms.filter((gym) => gym.status === 'ACTIVE').length;
    const openRequests = requests?.requests.filter((request) =>
      ['PENDING', 'IN_PROGRESS', 'CODE_SENT', 'SUBMITTED'].includes(request.status),
    ).length;
    const awaiting =
      requests?.requests.filter((request) => request.status === 'SUBMITTED').length ?? 0;
    content = (
      <>
        <div className="gym-roster-stats">
          <StatCard
            label="Gyms"
            value={gyms.length.toLocaleString('en-US')}
            sub={`${active} active`}
          />
          <StatCard
            label="Members"
            value={gyms.reduce((sum, gym) => sum + gym.memberCount, 0).toLocaleString('en-US')}
            sub={`across ${gyms.length} gyms`}
          />
          <Link href="/requests" className="ops-stat-link">
            <StatCard
              label="Requests"
              value={openRequests ?? '—'}
              sub={
                requests
                  ? awaiting
                    ? `${awaiting} awaiting approval`
                    : 'None awaiting approval'
                  : 'Could not load requests'
              }
            />
          </Link>
        </div>
        <GymsTable gyms={rows} />
      </>
    );
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load the roster (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.'}
      </Banner>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <PageHead
        title="Gyms"
        description="Every gym on the platform. Suspending one locks its staff and members out of new sessions."
        actions={
          <ButtonLink
            href="/gyms/new"
            label="New gym request"
            icon={
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          />
        }
      />
      <style>{`
        .gym-roster-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .gym-roster-stats > div { min-width: 0; }
        @media (max-width: 639px) {
          .gym-roster-stats { gap: 8px; }
          .gym-roster-stats > div { padding: 16px 10px; }
          .gym-roster-stats .ops-cap { font-size: 9px; letter-spacing: .08em; }
          .gym-roster-stats .ops-stat-value { font-size: 22px; }
          .gym-roster-stats .ops-stat p { display: none; }
        }
      `}</style>
      {content}
    </div>
  );
}
