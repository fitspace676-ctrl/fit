'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type {
  AdminClassTemplateRow,
  ClassTemplateSort,
  ClassTemplateStatus,
  SortDir,
} from '@fit/types';
import { Badge, Btn, DataTable, nextSortDir, type Column } from '@/components/ui';
import { STATUS_STYLES, formatDate, formatDuration, formatPricing } from './format';

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
  titleCell: {
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
  titleLink: {
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  categoryTag: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  cellText: {
    color: 'var(--color-text-primary)',
  },
  capacityText: {
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
});

/** A status pill mirroring the packages roster styling. */
function StatusPill({ status }: { status: ClassTemplateStatus }) {
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The class-templates roster table (T5.2). Server-rendered data, client-side
 * interaction: sortable column headers and pagination, both of which read/write
 * the URL search params so the server page stays the single source of truth. Each
 * row shows a colour swatch + title, the human recurrence summary, the default
 * trainer/location, the capacity, the duration, the status, and the validity
 * start. The data never mutates here.
 */
export function ClassTemplatesTable({
  templates,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  templates: AdminClassTemplateRow[];
  total: number;
  page: number;
  limit: number;
  sort: ClassTemplateSort;
  dir: SortDir;
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

  /** Toggle sort on a column: same column flips direction, a new column starts ascending. */
  function onSort(key: string): void {
    const nextDir = nextSortDir(sort === key, dir);
    startTransition(() => router.replace(hrefWith({ sort: key, dir: nextDir })));
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (templates.length === 0) {
    return (
      <Card variant="default" padding={0} xstyle={styles.emptyCard}>
        No class templates match your filters yet.
      </Card>
    );
  }

  const columns: ReadonlyArray<Column<AdminClassTemplateRow>> = [
    {
      key: 'title',
      header: 'Title',
      sortKey: 'title',
      cell: (template) => (
        <div {...stylex.props(styles.titleCell)}>
          <span
            aria-hidden
            {...stylex.props(styles.swatch)}
            style={{ backgroundColor: template.color }}
          />
          <Link href={`/classes/${template.id}`} {...stylex.props(styles.titleLink)}>
            {template.title}
          </Link>
          {template.category ? (
            <span {...stylex.props(styles.categoryTag)}>{template.category}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'recurrence',
      header: 'Recurrence',
      cell: (template) => <span {...stylex.props(styles.cellText)}>{template.recurrence}</span>,
    },
    {
      key: 'trainer',
      header: 'Trainer',
      cell: (template) => (
        <span {...stylex.props(styles.cellText)}>{template.trainerName ?? '—'}</span>
      ),
    },
    {
      key: 'capacity',
      header: 'Capacity',
      sortKey: 'capacity',
      cell: (template) => <span {...stylex.props(styles.capacityText)}>{template.capacity}</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      cell: (template) => (
        <span {...stylex.props(styles.cellText)}>{formatDuration(template.durationMinutes)}</span>
      ),
    },
    {
      key: 'pricing',
      header: 'Pricing',
      cell: (template) => <span {...stylex.props(styles.cellText)}>{formatPricing(template)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      cell: (template) => <StatusPill status={template.status} />,
    },
    {
      key: 'validFrom',
      header: 'Starts',
      sortKey: 'validFrom',
      cell: (template) => (
        <span {...stylex.props(styles.cellText)}>{formatDate(template.validFrom)}</span>
      ),
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      <DataTable<AdminClassTemplateRow>
        columns={columns}
        rows={templates}
        rowKey={(template) => template.id}
        sort={sort}
        dir={dir}
        onSort={onSort}
      />

      {/* Pager. */}
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
