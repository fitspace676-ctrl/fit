'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  type AdminAuditLogRow,
  type AuditAction,
} from '@fit/types';
import { Badge, EmptyState, type BadgeTone, type Column } from '@fit/ui-kit';

import { FilterPills, OpsTable } from '@/components/ops';

/** Tones by action family: creating is neutral, cutting off and acting-as are not. */
const ACTION_TONES: Partial<Record<AuditAction, BadgeTone>> = {
  'gym.create': 'positive',
  'gym.status.update': 'pending',
  'gym.impersonate': 'neutral',
  'gym.impersonate.start': 'danger',
};

/** `2026-01-15 14:32` in the reader's own zone — a trail is read against a clock. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * The action, in words where we have them.
 *
 * An unknown key renders as itself rather than being hidden: the API accepts any
 * action string so a newly-written action is readable here the moment it exists,
 * without waiting for a label.
 */
function actionLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action as AuditAction] ??
    action.replace(/[._-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
  );
}

function actionTone(action: string): BadgeTone {
  return ACTION_TONES[action as AuditAction] ?? 'neutral';
}

/** The one-line summary of what the metadata adds, or nothing. */
function detail(row: AdminAuditLogRow): string | null {
  const meta = row.metadata;
  if (!meta) return null;
  if (typeof meta.status === 'string') return `→ ${meta.status.toUpperCase()}`;
  if (typeof meta.subdomainSlug === 'string') return `${meta.subdomainSlug}`;
  if (typeof meta.ttlSeconds === 'number') return `${Math.round(meta.ttlSeconds / 60)} min session`;
  return null;
}

const styles = stylex.create({
  whoCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    alignItems: 'flex-start',
  },
  primary: {
    color: 'var(--color-text-primary)',
  },
  secondary: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  statusBadge: {
    boxShadow: 'inset 0 0 0 1px var(--ops-ink-200)',
  },
  gymLink: {
    fontWeight: 600,
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  slug: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  when: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
});

const COLUMNS: ReadonlyArray<Column<AdminAuditLogRow>> = [
  {
    key: 'when',
    header: 'When',
    xstyle: styles.when,
    cell: (row) => formatWhen(row.createdAt),
  },
  {
    key: 'action',
    header: 'Action',
    cell: (row) => (
      <div {...stylex.props(styles.whoCell)}>
        <Badge
          label={actionLabel(row.action)}
          tone={actionTone(row.action)}
          xstyle={row.action === 'gym.status.update' ? styles.statusBadge : undefined}
        />
        {detail(row) ? <span {...stylex.props(styles.slug)}>{detail(row)}</span> : null}
      </div>
    ),
  },
  {
    key: 'gym',
    header: 'Gym',
    cell: (row) =>
      row.gym ? (
        <div {...stylex.props(styles.whoCell)}>
          <Link href={`/gyms/${row.gym.id}`} {...stylex.props(styles.gymLink)}>
            {row.gym.name}
          </Link>
          <span {...stylex.props(styles.slug)}>{row.gym.subdomainSlug}</span>
        </div>
      ) : (
        // The trail outlives what it references, so this is an answer, not a gap.
        <span {...stylex.props(styles.secondary)}>No gym</span>
      ),
  },
  {
    key: 'actor',
    header: 'By',
    cell: (row) => (
      <div {...stylex.props(styles.whoCell)}>
        <span {...stylex.props(styles.primary)}>
          {row.actorName ?? row.actorEmail ?? 'unknown'}
        </span>
        {row.actorName && row.actorEmail ? (
          <span {...stylex.props(styles.secondary)}>{row.actorEmail}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'target',
    header: 'On',
    xstyle: styles.secondary,
    cell: (row) => row.targetEmail ?? row.targetName ?? '—',
  },
];

/**
 * The platform's trail: who did what, to which gym, when.
 *
 * A Client Component because `DataTable` is one and its columns carry render
 * functions; the rows and the paging are resolved on the server.
 */
export function ActivityTable({ rows }: { rows: AdminAuditLogRow[] }) {
  return (
    <OpsTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.id}
      caption="Platform activity"
      empty={
        <EmptyState
          title="Nothing recorded yet"
          body="Creating, suspending and impersonating a gym are all written here as they happen."
        />
      }
    />
  );
}

const filterStyles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0 },
  pills: { overflowX: 'auto', minWidth: 0 },
  gym: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  select: {
    maxWidth: '100%',
    height: '2rem',
    borderWidth: 0,
    borderRadius: '999px',
    paddingInline: '0.875rem',
    backgroundColor: 'var(--ops-white)',
    color: 'var(--color-text-primary)',
    fontFamily: 'inherit',
    fontSize: '0.78125rem',
    fontWeight: 600,
    outline: { default: 'none', ':focus-visible': '2px solid var(--ops-forma-400)' },
    outlineOffset: '2px',
  },
});

/** Controls only navigate; the server still filters and paginates the audit. */
export function ActivityFilters({
  action,
  gymId,
  gyms,
  rosterUnavailable,
}: {
  action?: string;
  gymId?: string;
  gyms: { id: string; name: string }[];
  rosterUnavailable: boolean;
}) {
  const router = useRouter();
  function navigate(nextAction: string | undefined, nextGym: string | undefined) {
    const params = new URLSearchParams();
    if (nextAction) params.set('action', nextAction);
    if (nextGym) params.set('gymId', nextGym);
    router.push(params.size ? `/activity?${params}` : '/activity');
  }
  const options = [
    { value: '', label: 'All actions' },
    ...AUDIT_ACTIONS.filter((value) => AUDIT_ACTION_LABELS[value]).map((value) => ({
      value,
      label: AUDIT_ACTION_LABELS[value],
    })),
  ];
  return (
    <div {...stylex.props(filterStyles.root)}>
      <div {...stylex.props(filterStyles.pills)}>
        <FilterPills
          label="Action"
          value={action ?? ''}
          options={options}
          onChange={(value) => navigate(value, gymId)}
        />
      </div>
      <div {...stylex.props(filterStyles.gym)}>
        <label htmlFor="activity-gym">Gym</label>
        <select
          id="activity-gym"
          value={gymId ?? ''}
          {...stylex.props(filterStyles.select)}
          onChange={(event) => navigate(action, event.target.value)}
        >
          <option value="">Any gym</option>
          {gymId && !gyms.some((gym) => gym.id === gymId) ? (
            <option value={gymId}>{gymId}</option>
          ) : null}
          {gyms.map((gym) => (
            <option key={gym.id} value={gym.id}>
              {gym.name}
            </option>
          ))}
        </select>
        {rosterUnavailable ? <span role="status">Could not load gym options.</span> : null}
      </div>
    </div>
  );
}
