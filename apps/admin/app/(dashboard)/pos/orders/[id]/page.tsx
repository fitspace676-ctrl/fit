import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission, type AdminOrderDetail } from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
import { Badge, Icon, type Tone } from '@/components/ui';
import { formatPrice } from '../../../shop/format-price';

export const metadata: Metadata = {
  title: 'Sale - Fit Admin',
  description: 'One sale in full: its lines, settlement, refunds and status history.',
};

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, Tone> = {
  PAID: 'success',
  PENDING: 'warning',
  REFUNDED: 'danger',
  CANCELLED: 'ink',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  member_account: 'Member account',
};

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  backIcon: { width: '1rem', height: '1rem' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.375rem, 3.5vw, 1.75rem)',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  meta: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' },
  metaItem: { fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  mono: { fontFamily: 'var(--font-family-code)', fontSize: '0.8125rem' },
  section: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
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
  credit: { color: 'var(--color-success)', fontVariantNumeric: 'tabular-nums', textAlign: 'end' },
  debit: { color: 'var(--color-error)', fontVariantNumeric: 'tabular-nums', textAlign: 'end' },
  totalsRow: { fontWeight: 700 },
  empty: {
    margin: 0,
    padding: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  timeline: { display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' },
  timelineRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' },
  timelineWhen: {
    minWidth: '11rem',
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
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
 * One sale, in full.
 *
 * Four records make up the history and they are shown separately rather than
 * merged into a single figure: the **lines** (what was rung up, including the
 * promo line when a code was used), the **payments** (how it settled), the
 * **refunds** (what went back, and whether the goods were restocked with it), and
 * the **status timeline** the API generates from an append-only log rather than
 * inferring from the current row.
 *
 * Keeping them apart is the point. A single net total would hide that a sale
 * happened at all, which is exactly the question someone reading this page after
 * a disputed charge is trying to answer.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (session === null || !roleHasPermission(session.role, Permission.BillingRead)) {
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>You do not have permission to view this sale.</span>
        </Card>
      </div>
    );
  }

  let order: AdminOrderDetail;
  try {
    order = await fetchOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this sale (${error.status}): ${error.message}`
        : 'Could not reach the Fit API.';
    return (
      <div {...stylex.props(styles.page)}>
        <Link href="/pos/orders" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          Back to the sales log
        </Link>
        <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  const netPaid = order.total - order.refundedAmount;

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/pos/orders" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to the sales log
      </Link>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>
            {order.customerName ?? (order.memberId ? 'Member sale' : 'Walk-in sale')}
          </h1>
          <div {...stylex.props(styles.meta)}>
            <Badge tone={STATUS_TONES[order.status] ?? 'ink'}>{order.status}</Badge>
            <Badge tone={order.channel === 'POS' ? 'brand' : 'ink'}>{order.channel}</Badge>
            <span {...stylex.props(styles.metaItem)}>
              {new Date(order.createdAt).toLocaleString()}
            </span>
            <span {...stylex.props(styles.metaItem, styles.mono)}>{order.id}</span>
          </div>
        </div>
      </header>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>What was sold</h2>
        <Card variant="default" padding={0} xstyle={styles.card}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th {...stylex.props(styles.th)}>Line</th>
                <th {...stylex.props(styles.th, styles.num)}>Qty</th>
                <th {...stylex.props(styles.th, styles.num)}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td {...stylex.props(styles.td)}>{item.label}</td>
                  <td {...stylex.props(styles.td, styles.num, styles.muted)}>{item.qty}</td>
                  {/* A negative line is a discount — a promo code, typically — so it
                      reads as a credit rather than an oddly-signed charge. */}
                  <td {...stylex.props(styles.td, item.amount < 0 ? styles.credit : styles.num)}>
                    {formatPrice(item.amount, order.currency)}
                  </td>
                </tr>
              ))}
              <tr {...stylex.props(styles.totalsRow)}>
                <td {...stylex.props(styles.td)}>Total</td>
                <td {...stylex.props(styles.td)} />
                <td {...stylex.props(styles.td, styles.num)}>
                  {formatPrice(order.total, order.currency)}
                </td>
              </tr>
              {order.refundedAmount > 0 ? (
                <tr {...stylex.props(styles.totalsRow)}>
                  <td {...stylex.props(styles.td)}>Net after refunds</td>
                  <td {...stylex.props(styles.td)} />
                  <td {...stylex.props(styles.td, styles.num)}>
                    {formatPrice(netPaid, order.currency)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>How it settled</h2>
        <Card variant="default" padding={0} xstyle={styles.card}>
          {order.payments.length === 0 ? (
            <p {...stylex.props(styles.empty)}>
              No payment recorded — this sale is still awaiting settlement.
            </p>
          ) : (
            <table {...stylex.props(styles.table)}>
              <thead>
                <tr>
                  <th {...stylex.props(styles.th)}>Method</th>
                  <th {...stylex.props(styles.th)}>Provider</th>
                  <th {...stylex.props(styles.th)}>Status</th>
                  <th {...stylex.props(styles.th, styles.num)}>Amount</th>
                  <th {...stylex.props(styles.th, styles.num)}>Refunded</th>
                </tr>
              </thead>
              <tbody>
                {order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td {...stylex.props(styles.td)}>
                      {METHOD_LABELS[payment.method] ?? payment.method}
                    </td>
                    <td {...stylex.props(styles.td, styles.muted, styles.mono)}>
                      {payment.provider}
                    </td>
                    <td {...stylex.props(styles.td, styles.muted)}>{payment.status}</td>
                    <td {...stylex.props(styles.td, styles.num)}>
                      {formatPrice(payment.amount, order.currency)}
                    </td>
                    <td {...stylex.props(styles.td, styles.debit)}>
                      {payment.refundedAmount > 0
                        ? `−${formatPrice(payment.refundedAmount, order.currency)}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>Refunds</h2>
        <Card variant="default" padding={0} xstyle={styles.card}>
          {order.refunds.length === 0 ? (
            <p {...stylex.props(styles.empty)}>Nothing refunded on this sale.</p>
          ) : (
            <table {...stylex.props(styles.table)}>
              <thead>
                <tr>
                  <th {...stylex.props(styles.th)}>When</th>
                  <th {...stylex.props(styles.th)}>Reason</th>
                  <th {...stylex.props(styles.th)}>Stock returned</th>
                  <th {...stylex.props(styles.th, styles.num)}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td {...stylex.props(styles.td, styles.muted)}>
                      {new Date(refund.createdAt).toLocaleString()}
                    </td>
                    <td {...stylex.props(styles.td)}>{refund.reason}</td>
                    <td {...stylex.props(styles.td, styles.muted)}>
                      {refund.restockItems ? 'Yes' : 'No — kept off the shelf'}
                    </td>
                    <td {...stylex.props(styles.td, styles.debit)}>
                      −{formatPrice(refund.amount, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.heading)}>History</h2>
        <Card variant="default" padding={0}>
          <div {...stylex.props(styles.timeline)}>
            {order.statusTimeline.map((entry, index) => (
              <div key={`${entry.status}-${index}`} {...stylex.props(styles.timelineRow)}>
                <span {...stylex.props(styles.timelineWhen)}>
                  {new Date(entry.at).toLocaleString()}
                </span>
                <Badge tone={STATUS_TONES[entry.status] ?? 'ink'}>{entry.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
