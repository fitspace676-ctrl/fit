import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminProductsQuerySchema,
  roleHasPermission,
  type ListAdminProductsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import {
  ApiError,
  fetchAnalytics,
  fetchLowStockProducts,
  fetchOrders,
  fetchProducts,
} from '@/lib/api';
import { Card, Icon, buttonClasses } from '@/components/ui';
import { ShopGlyph, type ShopGlyphName } from './icons';
import { ProductsFilters } from './products-filters';
import { ProductsTable } from './products-table';

export const metadata: Metadata = {
  title: 'Shop — Fit Admin',
  description:
    'The gym’s shop: catalog and inventory at a glance, with search, category-style filters, sorting, and product management with an image gallery and variants.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The headline figures for the stats strip. Each is `null` when its source call
 * failed (API down, or the caller's role lacks that read) — the card renders an
 * em dash instead of a made-up number, and the Orders tab drops its count badge.
 */
interface ShopStats {
  /** Captured shop revenue over the last 30 days, preformatted in the gym currency. */
  revenue30d: string | null;
  /** Online orders still awaiting payment ("open"). */
  openOnlineOrders: number | null;
  /** All orders on record — the Orders tab badge. */
  ordersTotal: number | null;
  /** Products carrying at least one low-stock variant. */
  lowStock: number | null;
  /** Products currently on sale (`ACTIVE`). */
  activeProducts: number | null;
}

/** Format a minor-unit amount as whole-unit currency, e.g. `$18,460`. */
function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${Math.round(major)} ${currency}`;
  }
}

/**
 * Load the stats strip's real aggregates in parallel, degrading per-card: the
 * revenue KPI needs `ReportView` and the order counts `BillingRead`, which not
 * every staff role holding `ProductRead` has, so each figure fails soft to `null`
 * rather than taking the whole page down.
 */
async function loadShopStats(): Promise<ShopStats> {
  const [analytics, openOrders, allOrders, lowStock, activeProducts] = await Promise.allSettled([
    fetchAnalytics('30d'),
    fetchOrders({ channel: 'ONLINE', status: 'PENDING', limit: 1 }),
    fetchOrders({ limit: 1 }),
    fetchLowStockProducts(),
    fetchProducts({ status: 'ACTIVE', limit: 1 }),
  ]);
  return {
    revenue30d:
      analytics.status === 'fulfilled'
        ? formatMoney(analytics.value.kpis.revenue.value, analytics.value.currency)
        : null,
    openOnlineOrders: openOrders.status === 'fulfilled' ? openOrders.value.total : null,
    ordersTotal: allOrders.status === 'fulfilled' ? allOrders.value.total : null,
    lowStock: lowStock.status === 'fulfilled' ? lowStock.value.data.length : null,
    activeProducts: activeProducts.status === 'fulfilled' ? activeProducts.value.total : null,
  };
}

/** One card of the stats strip — plain coloured glyph, headline figure, mono-caps label. */
function StatCard({
  label,
  value,
  glyph,
  tone,
  className = '',
}: {
  label: string;
  value: string;
  glyph: ShopGlyphName | 'check';
  tone: string;
  className?: string;
}) {
  return (
    <Card className={`flex items-center gap-3.5 p-4 ${className}`}>
      <span className={`grid shrink-0 place-items-center ${tone}`}>
        {glyph === 'check' ? (
          <Icon name="check" className="h-6 w-6" sw={2.1} />
        ) : (
          <ShopGlyph name={glyph} className="h-6 w-6" sw={2.1} />
        )}
      </span>
      <div className="min-w-0">
        <div className="truncate font-display text-2xl font-extrabold leading-none tabular-nums text-ink-900 dark:text-white">
          {value}
        </div>
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
          {label}
        </div>
      </div>
    </Card>
  );
}

/**
 * The Catalog / Orders segmented tabs from the reference — Catalog is this page,
 * Orders links to the orders roster and carries the live order count when the
 * caller can read it.
 */
function ShopTabs({ ordersTotal }: { ordersTotal: number | null }) {
  return (
    <div className="inline-flex rounded-btn border border-ink-200 bg-ink-100 p-1 dark:border-white/10 dark:bg-white/[0.06]">
      <span
        aria-current="page"
        className="inline-flex h-9 items-center gap-2 rounded-[7px] bg-white px-3.5 text-sm font-semibold text-ink-900 shadow-sm dark:text-ink-950"
      >
        <ShopGlyph name="box" className="h-4 w-4" sw={2} />
        Catalog
      </span>
      <Link
        href="/orders"
        className="inline-flex h-9 items-center gap-2 rounded-[7px] px-3.5 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="bag" className="h-4 w-4" sw={2} />
        Orders
        {ordersTotal !== null ? (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-ink-200 px-1 text-[10px] font-bold text-ink-600 dark:bg-white/10 dark:text-ink-300">
            {ordersTotal}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

/**
 * The shop catalog (T4.6), reskinned to the Planflow "formacore" shop reference.
 * Server-renders one filtered, server-paginated page of `GET /admin/products`
 * from the URL search params and hands it to the client table and the client
 * toolbar (search + sort dropdown + status chips). Above the table sits the
 * stats strip — real aggregates loaded in parallel and degraded per-card. The
 * `/products` route already requires staff (middleware) and the API enforces
 * `ProductRead`, so the only failure handled here is the API call itself.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminProductsQuerySchema.safeParse(raw);
  const query: ListAdminProductsQuery = parsed.success
    ? parsed.data
    : listAdminProductsQuerySchema.parse({});

  // "Add product" and the row switches are a `ProductWrite` capability — shown
  // only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  // Kick the stats off alongside the roster fetch; both resolve in parallel.
  const statsPromise = loadShopStats();

  let content;
  try {
    const result = await fetchProducts(query);
    content = (
      <ProductsTable
        products={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load products (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card
        role="alert"
        className="flex items-center gap-3 p-4 text-sm text-danger-700 dark:text-danger-300"
      >
        <Icon name="info" className="h-5 w-5 shrink-0" />
        <span>{message}</span>
      </Card>
    );
  }
  const stats = await statsPromise;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Shop
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Catalog, inventory and online orders for your gym.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ShopTabs ordersTotal={stats.ordersTotal} />
          {canWrite ? (
            <Link href="/products/new" className={buttonClasses('primary', 'sm')}>
              <Icon name="plus" className="h-4 w-4" sw={2} />
              Add product
            </Link>
          ) : null}
        </div>
      </header>

      {/* Stats strip. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Shop revenue · 30d"
          value={stats.revenue30d ?? '—'}
          glyph="trend"
          tone="text-brand-600 dark:text-brand-400"
        />
        <StatCard
          label="Online orders · open"
          value={stats.openOnlineOrders !== null ? String(stats.openOnlineOrders) : '—'}
          glyph="box"
          tone="text-accent-600 dark:text-accent-400"
        />
        <Link
          href="/products/low-stock"
          className="group block rounded-card outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30"
        >
          <StatCard
            label="Low stock"
            value={stats.lowStock !== null ? String(stats.lowStock) : '—'}
            glyph="warn"
            tone="text-warning-600 dark:text-warning-400"
            className="h-full transition-colors group-hover:border-brand-300 dark:group-hover:border-brand-500/50"
          />
        </Link>
        <StatCard
          label="Active products"
          value={stats.activeProducts !== null ? String(stats.activeProducts) : '—'}
          glyph="check"
          tone="text-success-600 dark:text-success-400"
        />
      </div>

      <ProductsFilters
        search={query.search ?? ''}
        status={query.status ?? ''}
        sort={query.sort}
        dir={query.dir}
      />

      {content}
    </div>
  );
}
