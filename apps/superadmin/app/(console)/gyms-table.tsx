'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AdminGymSummary, GymStatus } from '@fit/types';
import { Badge, Banner, DataTable, EmptyState, type BadgeTone, type Column } from '@fit/ui-kit';
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
    alignItems: 'baseline',
    gap: '0.5rem',
  },
  host: {
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
              {gym.subdomainSlug}
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
      cell: (gym) => <Badge label={STATUS[gym.status].label} tone={STATUS[gym.status].tone} />,
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

      <DataTable
        columns={columns}
        rows={gyms}
        rowKey={(gym) => gym.id}
        caption="Every gym on the platform"
        empty={
          <EmptyState
            title="No gyms yet"
            body="A gym appears here as soon as an owner signs up on the marketing site."
          />
        }
      />
    </div>
  );
}
