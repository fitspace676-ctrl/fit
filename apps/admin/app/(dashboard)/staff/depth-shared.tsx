'use client';

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { StaffMember } from '@fit/types';
import { Icon, Select } from '@/components/ui';
import { createDateTimeFormat } from '@fit/i18n';

/**
 * Shared visual language + helpers for the Staff-console depth tabs (T12.15) —
 * Notes / Tasks / Calendar / Time-off / Roles. Every surface uses
 * OUR Fit tokens (accent `--color-accent`, `#6257E3`) and works in light + dark,
 * so the panels read as one system with the rest of the console.
 */
export const depthStyles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  pickerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: '0.75rem',
  },
  pickerField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    width: {
      default: '100%',
      '@media (min-width: 640px)': '20rem',
    },
  },
  pickerLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  metaMono: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
  },
  rowMin: {
    minWidth: 0,
  },
  rowTitle: {
    margin: 0,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  rowSub: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  iconBtn: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
  iconBtnDanger: {
    color: 'var(--color-error)',
  },
  smIcon: {
    width: '1rem',
    height: '1rem',
  },
  emptyCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingInline: '1rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '1.75rem',
    height: '1.75rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
  },
  addFormRow: {
    display: 'grid',
    gap: '0.625rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  addFormActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.875rem',
  },
  tileHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  tileAuthor: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  tileBody: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-accent)',
  },
  chipRemove: {
    display: 'grid',
    placeItems: 'center',
    height: '1rem',
    width: '1rem',
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    background: 'none',
    cursor: 'pointer',
    color: 'inherit',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/** A centered empty-state line shown when a tab/section has no records yet. */
export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card variant="default" padding={0} xstyle={depthStyles.emptyCard}>
      <Icon name="info" {...stylex.props(depthStyles.emptyIcon)} />
      <p {...stylex.props(depthStyles.emptyText)}>{children}</p>
    </Card>
  );
}

/**
 * The shared "which staff member?" picker for the per-staff depth tabs (Notes /
 * Tasks / Calendar). Lists the gym's active staff; the selection is
 * lifted to the console so switching tabs keeps the chosen member.
 */
export function StaffPicker({
  label,
  staff,
  value,
  onChange,
}: {
  label: string;
  staff: StaffMember[];
  value: string;
  onChange: (staffId: string) => void;
  placeholder?: string;
}) {
  return (
    <div {...stylex.props(depthStyles.pickerField)}>
      <label htmlFor="staff-depth-picker" {...stylex.props(depthStyles.pickerLabel)}>
        {label}
      </label>
      <Select
        id="staff-depth-picker"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name} · {member.email}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Format an ISO instant as a short local date. */
export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : createDateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
        date,
      );
}

/** Format an ISO instant as a short local date-time. */
export function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : createDateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
