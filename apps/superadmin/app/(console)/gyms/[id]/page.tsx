import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Badge, Banner, Card, EmptyState } from '@fit/ui-kit';
import { ApiError, fetchGym } from '@/lib/api';
import { tenantAdminUrl, tenantPortalUrl } from '@/lib/tenant-url';
import { GymHeaderActions } from './gym-header';
import { StaffTable } from './staff-table';

export const metadata: Metadata = {
  title: 'Gym — FormaCore SuperAdmin',
  description: 'One gym: its owner, staff, subdomain, and operator actions.',
};

// Live tenant state read with the operator's session token — never cached.
export const dynamic = 'force-dynamic';

/** `2026-01-15` — a date an operator scans, not reads. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '72rem',
  },
  back: {
    fontSize: '0.8125rem',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  identity: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  hosts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
  },
  hostLink: {
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  facts: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  },
  fact: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  factLabel: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  factValue: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  factNum: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
});

/** One labelled number or short string in the facts strip. */
function Fact({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div {...stylex.props(styles.fact)}>
      <span {...stylex.props(styles.factLabel)}>{label}</span>
      <span {...stylex.props(styles.factValue, numeric && styles.factNum)}>{value}</span>
    </div>
  );
}

/**
 * One gym in full.
 *
 * The screen answers the questions a support conversation actually opens with:
 * who owns this, **has that owner ever signed in** (an unverified address means
 * the onboarding email was never followed, which is what "the gym you made isn't
 * working" nearly always turns out to be), who else can reach the console, and
 * is the tenant switched on. The two privileged actions are the same component
 * the roster row uses, so they cannot drift apart.
 */
export default async function GymDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let gym;
  try {
    gym = await fetchGym(id);
  } catch (error) {
    // A gym that is not there is a 404, not an error page: an operator following
    // a stale link should be told the gym is gone, not that something broke.
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    return (
      <div {...stylex.props(styles.page)}>
        <Banner tone="error">
          {error instanceof ApiError
            ? `Could not load this gym (${error.status}): ${error.message}`
            : 'Could not reach the FormaCore API.'}
        </Banner>
      </div>
    );
  }

  const portalUrl = tenantPortalUrl(gym.subdomainSlug);
  const adminUrl = tenantAdminUrl(gym.subdomainSlug);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/" {...stylex.props(styles.back)}>
        ← All gyms
      </Link>

      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.identity)}>
          <div {...stylex.props(styles.titleRow)}>
            <h1 {...stylex.props(styles.title)}>{gym.name}</h1>
            <Badge
              label={gym.status === 'ACTIVE' ? 'Active' : 'Suspended'}
              tone={gym.status === 'ACTIVE' ? 'positive' : 'danger'}
            />
          </div>
          <div {...stylex.props(styles.hosts)}>
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                {...stylex.props(styles.hostLink)}
              >
                {gym.subdomainSlug} ↗
              </a>
            ) : (
              <span {...stylex.props(styles.muted)}>{gym.subdomainSlug}</span>
            )}
            {adminUrl ? (
              <a
                href={adminUrl}
                target="_blank"
                rel="noreferrer"
                {...stylex.props(styles.hostLink)}
              >
                console ↗
              </a>
            ) : null}
          </div>
        </div>

        <GymHeaderActions gym={gym} />
      </div>

      <Card>
        <div {...stylex.props(styles.facts)}>
          <Fact label="Members" value={String(gym.memberCount)} numeric />
          <Fact label="Staff" value={String(gym.staff.length)} numeric />
          <Fact label="Locations" value={String(gym.locationCount)} numeric />
          <Fact label="Created" value={formatDate(gym.createdAt)} numeric />
        </div>
      </Card>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionTitle)}>Owner</h2>
        <Card>
          {gym.owner ? (
            <div {...stylex.props(styles.facts)}>
              <Fact label="Email" value={gym.owner.email} />
              <Fact label="Name" value={gym.owner.name ?? '—'} />
              <Fact
                label="Onboarding"
                value={
                  gym.owner.emailVerifiedAt
                    ? `verified ${formatDate(gym.owner.emailVerifiedAt)}`
                    : 'never verified'
                }
              />
            </div>
          ) : (
            <EmptyState
              compact
              title="No owner"
              body="This gym is not bound to an owner, so nobody can be impersonated and nobody holds OWNER permissions in it."
            />
          )}
        </Card>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionTitle)}>Staff</h2>
        <StaffTable staff={gym.staff} gymName={gym.name} />
      </section>

      <Link href={`/activity?gymId=${gym.id}`} {...stylex.props(styles.back)}>
        View this gym’s activity →
      </Link>
    </div>
  );
}
