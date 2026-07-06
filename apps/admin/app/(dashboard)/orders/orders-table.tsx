'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { AdminOrderRow, AdminOrderStatus } from '@fit/types';
import { Badge, Btn, DataTable, type Column, type Tone } from '@/components/ui';
import {
  CHANNEL_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  formatDateTime,
  formatMoney,
} from './format';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  exportRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  exportLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    textDecoration: 'none',
  },
  statusInner: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  dot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  dotInk: {
    backgroundColor: 'var(--color-text-secondary)',
  },
  dotAccent: {
    backgroundColor: 'var(--color-accent)',
  },
  dotSuccess: {
    backgroundColor: 'var(--color-success)',
  },
  dotWarning: {
    backgroundColor: 'var(--color-warning)',
  },
  dotError: {
    backgroundColor: 'var(--color-error)',
  },
  idLink: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  cellText: {
    color: 'var(--color-text-primary)',
  },
  moneyCell: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  refundedNote: {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 400,
    color: 'var(--color-error)',
  },
  empty: {
    margin: 0,
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
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

/** The leading status-dot colour per pill tone, on the brand tokens. */
const STATUS_DOT: Record<Tone, stylex.StyleXStyles> = {
  ink: styles.dotInk,
  brand: styles.dotAccent,
  success: styles.dotSuccess,
  warning: styles.dotWarning,
  danger: styles.dotError,
  accent: styles.dotAccent,
  iris: styles.dotAccent,
  flame: styles.dotWarning,
};

/** A status pill with a leading tone dot, matching the orders roster pills. */
function StatusPill({ status }: { status: AdminOrderStatus }) {
  const { label, tone } = ORDER_STATUS_STYLES[status];
  return (
    <Badge tone={tone}>
      <span {...stylex.props(styles.statusInner)}>
        <span aria-hidden {...stylex.props(styles.dot, STATUS_DOT[tone])} />
        {label}
      </span>
    </Badge>
  );
}

/**
 * The orders roster table (T7.9), rebuilt on the Astryx DataTable kit +
 * brand-tokened StyleX (T11.22). Server-rendered data, client-side interaction:
 * pagination and a CSV-export link, both reading the URL search params so the
 * server page stays the single source of truth. Each row shows the order's date,
 * channel, status, who it's for, the settlement method, the net total (with the
 * refunded amount called out), and the item count. The data never mutates here —
 * refunds happen on the detail page.
 */
export function OrdersTable({
  orders,
  total,
  page,
  limit,
  exportQuery,
}: {
  orders: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
  /** The active filters as a `?key=value` string, forwarded to the export link. */
  exportQuery: string;
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

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  const columns: ReadonlyArray<Column<AdminOrderRow>> = [
    {
      key: 'order',
      header: 'Order',
      cell: (order) => (
        <Link href={`/orders/${order.id}`} {...stylex.props(styles.idLink)}>
          {order.id.slice(-8)}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (order) => (
        <span {...stylex.props(styles.cellText)}>{formatDateTime(order.createdAt)}</span>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      cell: (order) => (
        <span {...stylex.props(styles.cellText)}>{CHANNEL_LABELS[order.channel]}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (order) => <StatusPill status={order.status} />,
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (order) => (
        <span {...stylex.props(styles.cellText)}>
          {order.customerName ?? (order.memberId ? 'Member' : 'Walk-in')}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      cell: (order) => (
        <span {...stylex.props(styles.cellText)}>
          {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : '—'}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      cell: (order) => (
        <span {...stylex.props(styles.moneyCell)}>
          {formatMoney(order.total, order.currency)}
          {order.refundedAmount > 0 && (
            <span {...stylex.props(styles.refundedNote)}>
              −{formatMoney(order.refundedAmount, order.currency)} refunded
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      align: 'right',
      cell: (order) => <span {...stylex.props(styles.moneyCell)}>{order.itemCount}</span>,
    },
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.exportRow)}>
        <a href={`/orders/export${exportQuery}`} {...stylex.props(styles.exportLink)}>
          Export CSV
        </a>
      </div>

      <DataTable<AdminOrderRow>
        columns={columns}
        rows={orders}
        rowKey={(order) => order.id}
        empty={<p {...stylex.props(styles.empty)}>No orders match your filters yet.</p>}
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
