'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { AdminClassTypeRow, ClassTypeSort, ClassTypeStatus, SortDir } from '@fit/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  nextSortDir,
  type BadgeTone,
  type Column,
} from '@fit/ui-kit';
import { formatDuration, formatPricing } from './format';
import { EditClassTypeDrawer } from './edit-class-type-drawer';
import type { RelationOption } from './class-template-form';

const STATUS_TONES: Record<ClassTypeStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptyCard: {
    paddingInline: '1rem',
    paddingBlock: '3rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  nameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  swatch: {
    height: '0.75rem',
    width: '0.75rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  nameText: {
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  cellText: {
    color: 'var(--color-text-primary)',
  },
  numText: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
  actionsCell: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

function StatusPill({ status }: { status: ClassTypeStatus }) {
  const { label, tone } = STATUS_TONES[status];
  return <Badge tone={tone} label={label} />;
}

/**
 * The class-types roster table — the gym's reusable catalogue of class kinds
 * (Boxing, CrossFit). Server-rendered data, client-side sort + pagination through
 * the URL search params. Each row shows a colour swatch + name, duration,
 * capacity, min attendance, pricing, and status.
 */
export function ClassTypesTable({
  types,
  total,
  page,
  limit,
  sort,
  dir,
  plans,
  canWrite,
}: {
  types: AdminClassTypeRow[];
  total: number;
  page: number;
  limit: number;
  sort: ClassTypeSort;
  dir: SortDir;
  plans: RelationOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (types.length === 0) {
    return (
      <Card padding="none" xstyle={styles.emptyCard}>
        No class types match your filters yet - add one to start scheduling.
      </Card>
    );
  }

  const columns: ReadonlyArray<Column<AdminClassTypeRow>> = [
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      cell: (type) => (
        <div {...stylex.props(styles.nameCell)}>
          <span
            aria-hidden
            {...stylex.props(styles.swatch)}
            style={{ backgroundColor: type.color }}
          />
          <span {...stylex.props(styles.nameText)}>{type.name}</span>
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      cell: (type) => (
        <span {...stylex.props(styles.cellText)}>{formatDuration(type.durationMinutes)}</span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      sortKey: 'capacity',
      cell: (type) => <span {...stylex.props(styles.numText)}>{type.capacity}</span>,
    },
    {
      key: 'minAttendance',
      header: 'Min',
      cell: (type) => <span {...stylex.props(styles.numText)}>{type.minAttendance ?? '-'}</span>,
    },
    {
      key: 'pricing',
      header: 'Pricing',
      cell: (type) => <span {...stylex.props(styles.cellText)}>{formatPricing(type)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (type) => <StatusPill status={type.status} />,
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (type: AdminClassTypeRow) => (
              <div {...stylex.props(styles.actionsCell)}>
                <EditClassTypeDrawer type={type} plans={plans} />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      <DataTable<AdminClassTypeRow>
        columns={columns}
        rows={types}
        rowKey={(type) => type.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
      />

      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            disabled={!hasPrev}
            label="Previous"
          />
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            disabled={!hasNext}
            label="Next"
          />
        </div>
      </div>
    </div>
  );
}
