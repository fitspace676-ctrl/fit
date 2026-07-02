import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { listOrdersQuerySchema, type ListOrdersQueryInput } from '@fit/types';
import { ApiError, fetchOrders, ordersQueryString } from '@/lib/api';
import { Card, buttonClasses } from '@/components/ui';
import { OrdersFilters } from './orders-filters';
import { OrdersTable } from './orders-table';
import { OrderGlyph, type OrderGlyphName } from './icons';
import { formatMoney } from './format';

export const metadata: Metadata = {
  title: 'Orders — Fit Admin',
  description:
    'The gym’s orders across POS and online channels: filter by channel, status, member, and date, open an order, issue a refund, or export to CSV.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Collapse a raw search param to a single string (first value of an array). */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The KPI strip's figures, each pre-rendered (null → the fetch failed → "—"). */
interface OrdersStats {
  ordersToday: string | null;
  revenueToday: string | null;
  pending: string | null;
  refunds7d: string | null;
}

/** One stat card of the KPI strip — toned icon, headline figure, micro label. */
function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  icon: OrderGlyphName;
  tone: string;
}) {
  return (
    <Card glow className="p-4 sm:p-5">
      <OrderGlyph name={icon} className={`h-5 w-5 ${tone}`} />
      <div className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value ?? '—'}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </div>
    </Card>
  );
}

/**
 * The orders roster (T7.9). Server-renders one filtered, server-paginated page of
 * `GET /orders` from the URL search params and hands it to the client filters
 * (status tabs / channel / member / date range) and the client table (pagination +
 * CSV export link). The KPI strip above them is backed by three extra narrow
 * `GET /orders` calls (today / pending / refunds·7d) — real aggregates, never
 * invented. The `/orders` route already requires staff with `BillingRead`
 * (middleware + nav gate) and the API re-enforces it, so the only failure handled
 * here is the API call itself.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listOrdersQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({});

  // The filters the table's export link and pager carry forward — the raw,
  // pre-coercion values straight off the URL so they round-trip unchanged.
  const filters: Partial<ListOrdersQueryInput> = {
    channel: one(raw.channel) as ListOrdersQueryInput['channel'],
    status: one(raw.status) as ListOrdersQueryInput['status'],
    memberId: one(raw.memberId),
    from: one(raw.from),
    to: one(raw.to),
  };
  const exportQuery = ordersQueryString(filters);

  // The KPI strip's date bounds — bare UTC calendar dates the API widens to whole
  // days (see `dateBoundSchema`).
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  let stats: OrdersStats = {
    ordersToday: null,
    revenueToday: null,
    pending: null,
    refunds7d: null,
  };
  let content: ReactNode;
  try {
    // Send the raw string filters (not the coerced query, whose dates are `Date`
    // objects) plus the validated page/limit; the API re-coerces and re-validates.
    // The three KPI calls swallow their own failures so a flaky aggregate never
    // takes the roster down with it.
    const [result, today, pending, refunds] = await Promise.all([
      fetchOrders({ ...filters, page: query.page, limit: query.limit }),
      fetchOrders({ from: todayIso, limit: 100 }).catch(() => null),
      fetchOrders({ status: 'PENDING', limit: 1 }).catch(() => null),
      fetchOrders({ status: 'REFUNDED', from: weekAgoIso, limit: 1 }).catch(() => null),
    ]);

    // Revenue today: settled money net of refunds, summed over today's rows
    // (capped at the API's 100-row page max — a lower bound on an extreme day).
    const settled = (today?.data ?? []).filter(
      (o) => o.status !== 'PENDING' && o.status !== 'CANCELLED',
    );
    const revenueMinor = settled.reduce((sum, o) => sum + o.total - o.refundedAmount, 0);
    const currency = today?.data[0]?.currency ?? result.data[0]?.currency;
    stats = {
      ordersToday: today ? String(today.total) : null,
      revenueToday: today && currency ? formatMoney(revenueMinor, currency) : today ? '—' : null,
      pending: pending ? String(pending.total) : null,
      refunds7d: refunds ? String(refunds.total) : null,
    };

    content = (
      <OrdersTable
        orders={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load orders (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p className="rounded-card border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-700 dark:text-danger-300">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Orders
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Shop & POS orders — fulfil, refund and export.
          </p>
        </div>
        {/* Streams the filtered set as CSV via the `/orders/export` proxy route. */}
        <a href={`/orders/export${exportQuery}`} className={buttonClasses('primary', 'sm')}>
          <OrderGlyph name="printer" className="h-4 w-4" />
          Export
        </a>
      </header>

      {/* KPI strip — real aggregates from narrow `GET /orders` calls. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders today" value={stats.ordersToday} icon="box" tone="text-brand-400" />
        <StatCard
          label="Revenue today"
          value={stats.revenueToday}
          icon="dollar"
          tone="text-success-400"
        />
        <StatCard label="Pending" value={stats.pending} icon="truck" tone="text-warning-400" />
        <StatCard label="Refunds · 7d" value={stats.refunds7d} icon="undo" tone="text-danger-400" />
      </div>

      <OrdersFilters
        channel={filters.channel ?? ''}
        status={filters.status ?? ''}
        memberId={filters.memberId ?? ''}
        from={filters.from ?? ''}
        to={filters.to ?? ''}
      />

      {content}
    </div>
  );
}
