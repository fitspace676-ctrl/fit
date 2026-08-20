import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchGyms } from '@/lib/api';
import { tenantAdminUrl, tenantPortalUrl } from '@/lib/tenant-url';
import { GymsTable, type GymRow } from './gyms-table';

export const metadata: Metadata = {
  title: 'Gyms — FormaCore SuperAdmin',
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
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  heading: {
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
});

export default async function GymsPage() {
  let content;
  try {
    const { gyms } = await fetchGyms();
    const rows: GymRow[] = gyms.map((gym) => ({
      ...gym,
      portalUrl: tenantPortalUrl(gym.subdomainSlug),
      adminUrl: tenantAdminUrl(gym.subdomainSlug),
    }));
    content = <GymsTable gyms={rows} />;
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
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h1 {...stylex.props(styles.title)}>Gyms</h1>
          <p {...stylex.props(styles.subtitle)}>
            Every gym on the platform. Suspending one locks its staff and members out of new
            sessions.
          </p>
        </div>
        <ButtonLink href="/gyms/new" label="New gym" />
      </header>
      {content}
    </div>
  );
}
