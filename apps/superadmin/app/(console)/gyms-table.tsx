'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { AdminGymSummary, GymStatus } from '@fit/types';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  type BadgeTone,
  type Column,
} from '@fit/ui-kit';
import { setGymStatusAction, startImpersonationAction } from './actions';

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
    color: 'var(--color-text-primary)',
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
 *
 * Suspension goes through a confirmation because it is not a display toggle: it
 * locks every member of staff and every member of that gym out of new sessions.
 * Reactivating is not confirmed — undoing a lockout should be one press.
 *
 * The table is unpaged and unsorted on purpose. The platform has tens of gyms,
 * not thousands; paging controls over 20 rows are furniture. When the roster
 * outgrows one screen, `DataTable` already carries the sort and pager wiring.
 */
export function GymsTable({ gyms }: { gyms: GymRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<GymRow | null>(null);

  function applyStatus(gym: GymRow, next: GymStatus) {
    setError(null);
    setBusyId(gym.id);
    startTransition(async () => {
      const result = await setGymStatusAction(gym.id, next);
      if (!result.ok) {
        setError(result.error);
      }
      setBusyId(null);
      setConfirming(null);
    });
  }

  /**
   * Open the gym's console as its owner, in a new tab.
   *
   * The tab is opened SYNCHRONOUSLY, inside the click, and only navigated once
   * the handoff URL comes back. Popup blockers allow `window.open` only from a
   * direct user gesture, and the gesture is over by the time the Server Action
   * resolves — opening first and pointing it afterwards is what keeps the click
   * from being swallowed. If the tab was blocked anyway, the current tab goes
   * instead, which is worse but not nothing.
   *
   * A new tab rather than this one because the operator is still working here:
   * entering one gym should not close the roster they are working through.
   */
  function enterAdmin(gym: GymRow) {
    setError(null);
    setBusyId(gym.id);
    const tab = window.open('', '_blank', 'noopener');
    startTransition(async () => {
      const result = await startImpersonationAction(gym.id, gym.subdomainSlug);
      if (result.ok) {
        if (tab) {
          tab.location.replace(result.data.url);
        } else {
          window.location.assign(result.data.url);
        }
      } else {
        tab?.close();
        setError(result.error);
      }
      setBusyId(null);
    });
  }

  const columns: ReadonlyArray<Column<GymRow>> = [
    {
      key: 'gym',
      header: 'Gym',
      cell: (gym) => (
        <div {...stylex.props(styles.nameCell)}>
          <span {...stylex.props(styles.name)}>{gym.name}</span>
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
          <Button
            variant="secondary"
            size="inline"
            label="Enter admin"
            // A gym with no owner has nobody to act as — the API answers
            // `422 GYM_HAS_NO_OWNER`, so the roster says so instead of asking.
            disabled={gym.owner === null}
            title={gym.owner === null ? 'This gym has no owner to impersonate' : undefined}
            loading={pending && busyId === gym.id}
            onClick={() => enterAdmin(gym)}
          />
          {gym.status === 'ACTIVE' ? (
            <Button
              variant="ghost"
              size="inline"
              label="Suspend"
              loading={pending && busyId === gym.id}
              onClick={() => setConfirming(gym)}
            />
          ) : (
            <Button
              variant="secondary"
              size="inline"
              label="Reactivate"
              loading={pending && busyId === gym.id}
              onClick={() => applyStatus(gym, 'ACTIVE')}
            />
          )}
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

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Suspend ${confirming.name}?` : 'Suspend gym?'}
        description="Its staff and members will not be able to start a new session until it is reactivated. Sessions already open expire on their own."
        cancelLabel="Cancel"
        confirmLabel="Suspend"
        confirmVariant="destructive"
        loading={pending}
        onConfirm={() => confirming && applyStatus(confirming, 'SUSPENDED')}
      />
    </div>
  );
}
