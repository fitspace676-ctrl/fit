import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Badge, Banner, Card, EmptyState } from '@fit/ui-kit';
import { ApiError, fetchGym } from '@/lib/api';
import { tenantAdminUrl, tenantOnboardingUrl, tenantPortalUrl } from '@/lib/tenant-url';
import { BackLink, Cap, Fact, Mono, PageHead, SectionTitle } from '@/components/ops';
import { InitialsAvatar, OnboardingStatusBadge } from './detail-primitives';
import { GymHeaderActions } from './gym-header';
import { StaffTable } from './staff-table';
import { OnboardingCard } from './onboarding-card';

export const metadata: Metadata = {
  title: 'Gym | FormaCore SuperAdmin',
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
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '72rem', minWidth: 0 },
  back: {
    fontSize: '0.8125rem',
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-accent)' },
    textDecoration: 'none',
  },
  hosts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
  },
  hostLink: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-accent)' },
    textDecoration: 'none',
    overflowWrap: 'anywhere',
  },
  facts: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  columns: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': 'minmax(0, 5fr) minmax(0, 7fr)',
    },
  },
  section: { display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 },
  owner: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  identity: { display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 },
  identityText: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: '0.125rem' },
  name: { fontSize: '0.9375rem', fontWeight: 700, overflowWrap: 'anywhere' },
  email: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' },
  ownerRows: { borderTop: '1px solid var(--ops-ink-100)' },
  ownerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    paddingBlock: '0.75rem',
    borderBottom: '1px solid var(--ops-ink-100)',
    fontSize: '0.875rem',
  },
  value: { minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 },
  dates: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1.5rem',
    borderTop: '1px solid var(--ops-ink-100)',
    paddingTop: '1.25rem',
  },
});

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
      <PageHead
        eyebrow={<BackLink href="/" label="Gyms" />}
        title={
          <>
            {gym.name}
            <Badge
              label={gym.status === 'ACTIVE' ? 'Active' : 'Suspended'}
              tone={gym.status === 'ACTIVE' ? 'positive' : 'danger'}
              icon={<span aria-hidden="true">●</span>}
            />
          </>
        }
        subtitle={
          <span {...stylex.props(styles.hosts)}>
            {portalUrl ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                {...stylex.props(styles.hostLink)}
              >
                {portalUrl.replace(/^https?:\/\//, '')} ↗
              </a>
            ) : (
              <span>{gym.subdomainSlug}</span>
            )}
            {adminUrl ? (
              <a
                href={adminUrl}
                target="_blank"
                rel="noreferrer"
                {...stylex.props(styles.hostLink)}
              >
                {adminUrl.replace(/^https?:\/\//, '')} ↗
              </a>
            ) : (
              <span>{gym.subdomainSlug}/admin</span>
            )}
          </span>
        }
        actions={<GymHeaderActions gym={gym} />}
      />

      <Card>
        <div {...stylex.props(styles.facts)}>
          <Fact label="Members" value={String(gym.memberCount)} numeric />
          <Fact label="Staff" value={String(gym.staff.length)} numeric />
          <Fact label="Locations" value={String(gym.locationCount)} numeric />
          <Fact label="Created" value={formatDate(gym.createdAt)} numeric />
        </div>
      </Card>

      <div {...stylex.props(styles.columns)}>
        <section {...stylex.props(styles.section)}>
          <SectionTitle>Owner</SectionTitle>
          <Card>
            {gym.owner ? (
              <div {...stylex.props(styles.owner)}>
                <div {...stylex.props(styles.identity)}>
                  <InitialsAvatar name={gym.owner.name} email={gym.owner.email} owner />
                  <div {...stylex.props(styles.identityText)}>
                    <span {...stylex.props(styles.name)}>{gym.owner.name ?? gym.owner.email}</span>
                    <span {...stylex.props(styles.email)}>{gym.owner.email}</span>
                  </div>
                </div>
                <div {...stylex.props(styles.ownerRows)}>
                  <div {...stylex.props(styles.ownerRow)}>
                    <Cap>Email</Cap>
                    <span {...stylex.props(styles.value)}>{gym.owner.email}</span>
                  </div>
                  <div {...stylex.props(styles.ownerRow)}>
                    <Cap>Name</Cap>
                    <span {...stylex.props(styles.value)}>{gym.owner.name ?? '—'}</span>
                  </div>
                  <div {...stylex.props(styles.ownerRow)}>
                    <Cap>Onboarding</Cap>
                    {gym.onboarding ? (
                      <OnboardingStatusBadge status={gym.onboarding.status} />
                    ) : (
                      <span>
                        {gym.owner.emailVerifiedAt
                          ? `verified ${formatDate(gym.owner.emailVerifiedAt)}`
                          : 'never verified'}
                      </span>
                    )}
                  </div>
                  <div {...stylex.props(styles.ownerRow)}>
                    <Cap>Verified</Cap>
                    <Mono>
                      {gym.owner.emailVerifiedAt ? formatDate(gym.owner.emailVerifiedAt) : 'never'}
                    </Mono>
                  </div>
                </div>
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
          <SectionTitle
            aside={
              gym.onboarding ? <OnboardingStatusBadge status={gym.onboarding.status} /> : undefined
            }
          >
            Onboarding
          </SectionTitle>
          <OnboardingCard
            key={gym.onboarding?.token ?? gym.onboarding?.status ?? 'none'}
            gymId={gym.id}
            slug={gym.subdomainSlug}
            onboarding={gym.onboarding}
            url={
              gym.onboarding?.token
                ? tenantOnboardingUrl(gym.subdomainSlug, gym.onboarding.token)
                : null
            }
          >
            {gym.onboarding ? (
              <div {...stylex.props(styles.dates)}>
                <Fact
                  label="Started"
                  value={
                    <Mono>
                      {gym.onboarding.startedAt ? formatDate(gym.onboarding.startedAt) : '—'}
                    </Mono>
                  }
                />
                <Fact label="Expires" value={<Mono>{formatDate(gym.onboarding.expiresAt)}</Mono>} />
                <Fact
                  label="Completed"
                  value={
                    <Mono>
                      {gym.onboarding.completedAt ? formatDate(gym.onboarding.completedAt) : '—'}
                    </Mono>
                  }
                />
              </div>
            ) : null}
          </OnboardingCard>
        </section>
      </div>

      <section {...stylex.props(styles.section)}>
        <SectionTitle
          aside={
            <Mono>
              {gym.staff.length} {gym.staff.length === 1 ? 'person' : 'people'}
            </Mono>
          }
        >
          Staff
        </SectionTitle>
        <StaffTable staff={gym.staff} gymName={gym.name} />
      </section>

      <Link href={`/activity?gymId=${gym.id}`} {...stylex.props(styles.back)}>
        View this gym’s activity →
      </Link>
    </div>
  );
}
