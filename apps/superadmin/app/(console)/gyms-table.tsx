'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AdminGymSummary, GymStatus } from '@fit/types';
import { Badge, Banner, EmptyState, type BadgeTone, type Column } from '@fit/ui-kit';
import { FilterPills, OpsTable, SearchField } from '@/components/ops';
import { GymActions } from './gym-actions';

/** One gym plus the tenant links the server resolved for it. */
export interface GymRow extends AdminGymSummary {
  portalUrl: string | null;
  adminUrl: string | null;
}

const STATUS: Record<GymStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
};

/** `2026-01-15` — a date an operator scans, not reads. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

const styles = stylex.create({
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  search: { width: { default: '100%', '@media (min-width: 640px)': '18rem' } },
  status: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.375rem' },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--ops-ink-200)',
    color: 'var(--ops-ink-600)',
    fontWeight: 500,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  nameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  name: {
    fontWeight: 600,
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  owner: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  ownerMissing: {
    fontSize: '0.75rem',
    fontStyle: 'italic',
    color: 'var(--color-text-secondary)',
  },
  hostCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    whiteSpace: 'nowrap',
  },
  host: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  hostPlain: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  consoleLink: {
    fontSize: '0.75rem',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  num: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap',
  },
  actionsCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.375rem',
  },
});

/**
 * The roster: one row per tenant, with the two things an operator opens it for —
 * where the gym lives (its subdomain, as a link) and whether it is switched on.
 * The gym's name leads to its detail screen; the actions are
 * {@link GymActions}, shared with that screen.
 *
 * The table is unpaged and unsorted on purpose. The platform has tens of gyms,
 * not thousands; paging controls over 20 rows are furniture. When the roster
 * outgrows one screen, `DataTable` already carries the sort and pager wiring.
 */
export function GymsTable({ gyms }: { gyms: GymRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | GymStatus>('all');
  const [query, setQuery] = useState('');
  const active = gyms.filter((gym) => gym.status === 'ACTIVE').length;
  const needle = query.trim().toLowerCase();
  const rows = gyms.filter(
    (gym) =>
      (filter === 'all' || gym.status === filter) &&
      [gym.name, gym.subdomainSlug, gym.owner?.email ?? '', gym.owner?.name ?? ''].some((value) =>
        value.toLowerCase().includes(needle),
      ),
  );

  const columns: ReadonlyArray<Column<GymRow>> = [
    {
      key: 'gym',
      header: 'Gym',
      cell: (gym) => (
        <div {...stylex.props(styles.nameCell)}>
          <Link href={`/gyms/${gym.id}`} {...stylex.props(styles.name)}>
            {gym.name}
          </Link>
          {gym.owner ? (
            <span {...stylex.props(styles.owner)}>{gym.owner.email}</span>
          ) : (
            <span {...stylex.props(styles.ownerMissing)}>no owner</span>
          )}
        </div>
      ),
    },
    {
      key: 'subdomain',
      header: 'Subdomain',
      cell: (gym) => (
        <div {...stylex.props(styles.hostCell)}>
          {gym.portalUrl ? (
            <a href={gym.portalUrl} target="_blank" rel="noreferrer" {...stylex.props(styles.host)}>
              {gym.subdomainSlug}{' '}
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
              </svg>
            </a>
          ) : (
            <span {...stylex.props(styles.hostPlain)}>{gym.subdomainSlug}</span>
          )}
          {gym.adminUrl ? (
            <a
              href={gym.adminUrl}
              target="_blank"
              rel="noreferrer"
              {...stylex.props(styles.consoleLink)}
            >
              console ↗
            </a>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (gym) => (
        <div {...stylex.props(styles.status)}>
          <Badge
            label={STATUS[gym.status].label}
            tone={STATUS[gym.status].tone}
            icon={
              <svg aria-hidden="true" width="6" height="6" viewBox="0 0 6 6">
                <circle cx="3" cy="3" r="3" fill="currentColor" />
              </svg>
            }
          />
          {gym.onboardingProgress && gym.onboardingProgress.status !== 'COMPLETED' ? (
            <Badge
              tone="pending"
              xstyle={styles.outline}
              label={
                gym.onboardingProgress.status === 'EXPIRED'
                  ? 'Onboarding expired'
                  : `Onboarding ${gym.onboardingProgress.completedSteps}/${gym.onboardingProgress.totalSteps}`
              }
            />
          ) : null}
        </div>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      align: 'right',
      xstyle: styles.num,
      cell: (gym) => gym.memberCount,
    },
    {
      key: 'created',
      header: 'Created',
      align: 'right',
      xstyle: styles.num,
      cell: (gym) => formatDate(gym.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (gym) => (
        <div {...stylex.props(styles.actionsCell)}>
          <GymActions gym={gym} onError={setError} />
        </div>
      ),
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <div {...stylex.props(styles.filters)}>
        <FilterPills
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All · ${gyms.length}` },
            { value: 'ACTIVE', label: `Active · ${active}` },
            { value: 'SUSPENDED', label: `Suspended · ${gyms.length - active}` },
          ]}
        />
        <div {...stylex.props(styles.search)}>
          <SearchField
            label="Search gyms"
            placeholder="Search name, subdomain, owner"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <OpsTable
        columns={columns}
        rows={rows}
        rowKey={(gym) => gym.id}
        caption="Every gym on the platform"
        empty={
          <EmptyState
            title={gyms.length ? 'No gyms found' : 'No gyms yet'}
            body={
              gyms.length
                ? 'Try another search or status filter.'
                : 'A gym appears here as soon as an owner signs up on the marketing site.'
            }
          />
        }
      />
    </div>
  );
}
