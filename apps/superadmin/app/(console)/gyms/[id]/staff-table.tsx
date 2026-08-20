'use client';

import * as stylex from '@stylexjs/stylex';
import type { AdminGymStaffMember, StaffStatus } from '@fit/types';
import { Badge, DataTable, EmptyState, type BadgeTone, type Column } from '@fit/ui-kit';

const STATUS_TONES: Record<StaffStatus, BadgeTone> = {
  ACTIVE: 'positive',
  INVITED: 'pending',
  SUSPENDED: 'danger',
};

/** `2026-01-15` — a date an operator scans, not reads. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

const styles = stylex.create({
  cellText: {
    color: 'var(--color-text-primary)',
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  num: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
});

const COLUMNS: ReadonlyArray<Column<AdminGymStaffMember>> = [
  {
    key: 'person',
    header: 'Person',
    xstyle: styles.cellText,
    cell: (member) => member.name ?? member.email,
  },
  { key: 'email', header: 'Email', xstyle: styles.muted, cell: (member) => member.email },
  { key: 'role', header: 'Role', cell: (member) => <Badge label={member.role} tone="neutral" /> },
  {
    key: 'status',
    header: 'Status',
    cell: (member) => <Badge label={member.status} tone={STATUS_TONES[member.status]} />,
  },
  {
    key: 'joined',
    header: 'Joined',
    align: 'right',
    xstyle: styles.num,
    cell: (member) => formatDate(member.joinedAt),
  },
];

/**
 * Everyone who can sign into this gym's console.
 *
 * A Client Component purely because `DataTable` is one, and its `columns` carry
 * render functions — which cannot cross the server/client boundary as props. The
 * rows themselves are server-fetched and handed over as plain data.
 */
export function StaffTable({ staff, gymName }: { staff: AdminGymStaffMember[]; gymName: string }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={staff}
      rowKey={(member) => member.userId}
      caption={`Staff of ${gymName}`}
      empty={
        <EmptyState
          title="No staff yet"
          body="Everyone here can sign into this gym's console. Staff are added by invitation from inside it."
        />
      }
    />
  );
}
