'use client';

import * as stylex from '@stylexjs/stylex';
import {
  Button,
  DataTable,
  SegmentedControl,
  type ButtonProps,
  type DataTableProps,
  type SegmentedControlProps,
} from '@fit/ui-kit';

const styles = stylex.create({
  surface: {
    backgroundColor: { default: 'var(--ops-white)', ':hover': 'var(--ops-ink-50)' },
    color: 'var(--ops-ink-950)',
  },
  filters: { backgroundColor: 'var(--ops-white)', flexWrap: 'wrap' },
});

export function SurfaceButton({ xstyle, ...props }: Omit<ButtonProps, 'variant'>) {
  return (
    <Button {...props} variant="secondary" xstyle={[!props.disabled && styles.surface, xstyle]} />
  );
}

export function FilterPills<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} xstyle={[styles.filters, props.xstyle]} />;
}

/** Keeps the kit's sorting, selection, empty state, and contained scrolling. */
export function OpsTable<T>(props: DataTableProps<T>) {
  return (
    <div className="ops-table">
      <DataTable {...props} />
    </div>
  );
}
