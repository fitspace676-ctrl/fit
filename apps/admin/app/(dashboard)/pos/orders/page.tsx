import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  DEFAULT_CURRENCY,
  Permission,
  listOrdersQuerySchema,
  roleHasPermission,
  type AdminOrderRow,
  type ListOrdersResponse,
  type OrderChannel,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { getActiveLocationId } from '@/lib/active-location-server';
import { ApiError, fetchOrders } from '@/lib/api';
import { Badge, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { formatPrice } from '../../shop/format-price';
import { OrdersFilters } from './orders-filters';
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

export const metadata: Metadata = {
  title: 'Sales log - FormaCore Admin',
  description:
    'Every sale the till and the online shop have recorded: what was sold, how it was paid for, what was refunded, and when.',
};

// The log reflects live takings and the staff session, so it is never cached.
export const dynamic = 'force-dynamic';

/** How many rows one page of the log holds. */
const PAGE_SIZE = 25;

/** The badge each order status wears. */
const STATUS_TONES: Record<string, BadgeTone> = {
  PAID: 'positive',
  PENDING: 'pending',
  REFUNDED: 'danger',
  CANCELLED: 'neutral',
};

/** How each settlement method reads in the table. */
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Account',
};

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '44rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  headActions: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  outlineLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
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
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  linkIcon: { width: '1rem', height: '1rem' },
  tiles: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  tileLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  tileValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  tileHint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  card: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  th: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    textAlign: 'start',
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
    whiteSpace: 'nowrap',
  },
  td: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
    verticalAlign: 'middle',
  },
  num: { textAlign: 'end', fontVariantNumeric: 'tabular-nums' },
  muted: { color: 'var(--color-text-secondary)' },
  refunded: { color: 'var(--color-error)', fontVariantNumeric: 'tabular-nums', textAlign: 'end' },
  orderLink: { color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 600 },
  mono: { fontFamily: 'var(--font-family-code)', fontSize: '0.8125rem' },
  empty: {
    margin: 0,
    padding: '1.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerLinks: { display: 'flex', gap: '0.5rem' },
  pagerLink: {
    paddingInline: '0.875rem',
    paddingBlock: '0.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  pagerLinkOff: { opacity: 0.4, pointerEvents: 'none' },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    color: 'var(--color-error)',
  },
  errorIcon: { width: '1.25rem', height: '1.25rem', flexShrink: 0 },
});

/**
 * The sales log — every order the till and the shop have recorded.
 *
 * The API has carried this history since the POS landed; the console had no way
 * to look at it, so the only record staff could reach was the end-of-day cash
 * total. This is the missing half: each sale, what was in it, how it settled, and
 * what has since been refunded.
 *
 * It opens on the **till's** own sales, because that is the question someone
 * standing at the desk is asking ("what did we sell today?"). The channel filter
 * widens it to the online shop or both.
 *
 * Money is shown twice on purpose: `total` is what was rung up, and the refunded
 * column what has gone back since. A single net figure would hide the fact that a
 * sale happened at all, and reconciliation needs both halves.
 */
export default async function OrdersLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  /** One search param as a non-empty string, or `undefined` — repeated params are ignored. */
  const str = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };

  // The till's sales are the default view; `channel=ALL` clears the narrowing.
  const channelParam = str('channel') ?? 'POS';
  const channel: OrderChannel | undefined =
    channelParam === 'ALL' ? undefined : (channelParam as OrderChannel);

  const parsed = listOrdersQuerySchema.safeParse({
    page: str('page') ?? 1,
    limit: PAGE_SIZE,
    ...(channel ? { channel } : {}),
    ...(str('status') ? { status: str('status') } : {}),
    ...(str('from') ? { from: str('from') } : {}),
    ...(str('to') ? { to: str('to') } : {}),
  });
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({ limit: PAGE_SIZE });

  const session = await getServerSession();
  const canRead = session !== null && roleHasPermission(session.role, Permission.BillingRead);
  if (!canRead) {
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>You do not have permission to view the sales log.</span>
        </Card>
      </div>
    );
  }

  // The branch the console is scoped to: the top-bar switcher's cookie, or an
  // explicit `?locationId=` on this URL. `undefined` means every branch, which is
  // what the log showed before the switcher was wired and still its default.
  const locationId = await getActiveLocationId(raw);

  // The branch column earns its width only in "All locations" mode. With a branch
  // selected the switcher already names it in the chrome and every row repeats
  // that one value, so the column is a constant taking space from the figures
  // this table exists to show. Same call the roadmap makes for
  // `revenue-by-location-card` — kept for "All locations", hidden once the view
  // is already one branch's.
  const showBranch = locationId === undefined;

  let result: ListOrdersResponse;
  try {
    result = await fetchOrders({
      page: query.page,
      limit: query.limit,
      ...(locationId ? { locationId } : {}),
      ...(channel ? { channel } : {}),
      ...(str('status') ? { status: str('status') as never } : {}),
      ...(str('from') ? { from: str('from') } : {}),
      ...(str('to') ? { to: str('to') } : {}),
    });
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load the sales log (${error.status}): ${error.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  const { data, total, page, limit } = result;
  const currency = data[0]?.currency ?? DEFAULT_CURRENCY;
  const grossOnPage = data.reduce((sum, o) => sum + o.total, 0);
  const refundedOnPage = data.reduce((sum, o) => sum + o.refundedAmount, 0);

  const withParam = (key: string, value: string): string => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v !== '') next.set(k, v);
    }
    if (value === '') next.delete(key);
    else next.set(key, value);
    return `/pos/orders?${next.toString()}`;
  };

  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Sales log</h1>
          <p {...stylex.props(styles.subtitle)}>
            Every sale the till and the shop have recorded - what was in it, how it settled, and
            anything refunded since. Open a sale for its full line-by-line history.
          </p>
        </div>
        <div {...stylex.props(styles.headActions)}>
          <Link href="/pos" {...stylex.props(styles.outlineLink)}>
            <Icon name="card" sw={2} {...stylex.props(styles.linkIcon)} />
            Back to till
          </Link>
        </div>
      </header>

      <div {...stylex.props(styles.tiles)}>
        <Tile
          label="Sales on this page"
          value={String(data.length)}
          hint={`of ${total} matching`}
        />
        <Tile label="Rung up" value={formatPrice(grossOnPage, currency)} />
        <Tile
          label="Refunded"
          value={formatPrice(refundedOnPage, currency)}
          hint={refundedOnPage > 0 ? 'across this page' : undefined}
        />
        <Tile label="Net" value={formatPrice(grossOnPage - refundedOnPage, currency)} />
      </div>

      <OrdersFilters
        channel={channelParam}
        status={str('status') ?? ''}
        from={str('from') ?? ''}
        to={str('to') ?? ''}
      />

      <Card padding="none" xstyle={styles.card}>
        {data.length === 0 ? (
          <p {...stylex.props(styles.empty)}>
            No sales match these filters. Widen the dates, or switch the channel.
          </p>
        ) : (
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th {...stylex.props(styles.th)}>When</th>
                <th {...stylex.props(styles.th)}>Channel</th>
                {showBranch ? <th {...stylex.props(styles.th)}>Branch</th> : null}
                <th {...stylex.props(styles.th)}>Customer</th>
                <th {...stylex.props(styles.th, styles.num)}>Items</th>
                <th {...stylex.props(styles.th)}>Paid by</th>
                <th {...stylex.props(styles.th, styles.num)}>Total</th>
                <th {...stylex.props(styles.th, styles.num)}>Refunded</th>
                <th {...stylex.props(styles.th)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((order) => (
                <OrderRow key={order.id} order={order} showBranch={showBranch} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div {...stylex.props(styles.pager)}>
        <span>
          Page {page} of {lastPage} · {total} sales
        </span>
        <div {...stylex.props(styles.pagerLinks)}>
          <Link
            href={withParam('page', String(Math.max(1, page - 1)))}
            {...stylex.props(styles.pagerLink, page <= 1 && styles.pagerLinkOff)}
          >
            Previous
          </Link>
          <Link
            href={withParam('page', String(Math.min(lastPage, page + 1)))}
            {...stylex.props(styles.pagerLink, page >= lastPage && styles.pagerLinkOff)}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div {...stylex.props(styles.tile)}>
      <span {...stylex.props(styles.tileLabel)}>{label}</span>
      <span {...stylex.props(styles.tileValue)}>{value}</span>
      {hint ? <span {...stylex.props(styles.tileHint)}>{hint}</span> : null}
    </div>
  );
}

function OrderRow({ order, showBranch }: { order: AdminOrderRow; showBranch: boolean }) {
  const when = new Date(order.createdAt);
  return (
    <tr>
      <td {...stylex.props(styles.td, styles.muted)}>
        {createDateTimeFormat(defaultLocale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(when)}
      </td>
      <td {...stylex.props(styles.td)}>
        <Badge tone={order.channel === 'POS' ? 'accent' : 'neutral'} label={order.channel} />
      </td>
      {/* An unattributed sale gets the same dash the other optional columns use,
          so the cell reads as "no branch" rather than as a row that failed to load. */}
      {showBranch ? (
        <td {...stylex.props(styles.td, styles.muted)}>{order.locationName ?? '-'}</td>
      ) : null}
      <td {...stylex.props(styles.td)}>
        <Link href={`/pos/orders/${order.id}`} {...stylex.props(styles.orderLink)}>
          {order.customerName ?? (order.memberId ? 'Member' : 'Walk-in')}
        </Link>
      </td>
      <td {...stylex.props(styles.td, styles.num)}>{order.itemCount}</td>
      <td {...stylex.props(styles.td, styles.muted)}>
        {order.paymentMethod ? (METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod) : '-'}
      </td>
      <td {...stylex.props(styles.td, styles.num)}>{formatPrice(order.total, order.currency)}</td>
      <td {...stylex.props(styles.td, styles.refunded)}>
        {order.refundedAmount > 0 ? `−${formatPrice(order.refundedAmount, order.currency)}` : '-'}
      </td>
      <td {...stylex.props(styles.td)}>
        <Badge tone={STATUS_TONES[order.status] ?? 'neutral'} label={order.status} />
      </td>
    </tr>
  );
}
