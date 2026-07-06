import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission, type AdminPayment } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchOrder } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon, type IconName, type Tone } from '@/components/ui';
import {
  CHANNEL_LABELS,
  FULFILLMENT_LABELS,
  ORDER_STATUS_STYLES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_STYLES,
  formatDateTime,
  formatMoney,
} from '../format';
import { RefundForm } from './refund-form';

export const metadata: Metadata = {
  title: 'Order — Fit Admin',
};

// The detail reflects live order state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** The remaining refundable balance on a payment, in minor units. */
function refundableMinor(payment: AdminPayment | undefined): number {
  return payment ? Math.max(0, payment.amount - payment.refundedAmount) : 0;
}

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  crumbIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  crumbLink: {
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  crumbCurrent: {
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-primary)',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  identityCard: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'space-between',
    },
    gap: '1rem',
    padding: '1.25rem',
  },
  identityLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  identityIcon: {
    display: 'grid',
    height: '3.5rem',
    width: '3.5rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  identityIconSvg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  identityCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  orderId: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: {
      default: '1.125rem',
      '@media (min-width: 640px)': '1.25rem',
    },
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.75rem',
    rowGap: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  deliveryText: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-primary)',
  },
  deliveryLabel: {
    color: 'var(--color-text-secondary)',
  },
  deliveryAddress: {
    whiteSpace: 'pre-line',
  },
  kpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (min-width: 640px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  kpiIcon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  kpiIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiIconAccent: {
    color: 'var(--color-text-accent)',
  },
  kpiIconSuccess: {
    color: 'var(--color-success)',
  },
  kpiIconError: {
    color: 'var(--color-error)',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  kpiLabel: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  bodyGrid: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  mainCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  sectionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '1.25rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  th: {
    paddingBlock: '0.375rem',
    paddingRight: '1rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  thLast: {
    paddingRight: 0,
  },
  alignRight: {
    textAlign: 'right',
  },
  bodyRow: {
    borderBottomWidth: {
      default: '1px',
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  td: {
    paddingBlock: '0.5rem',
    paddingRight: '1rem',
    color: 'var(--color-text-primary)',
  },
  tdLast: {
    paddingRight: 0,
  },
  mono: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  footRow: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  footLabel: {
    paddingBlock: '0.5rem',
    paddingRight: '1rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  footValue: {
    paddingBlock: '0.5rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  twoCol: {
    display: 'grid',
    gap: '1.5rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  payList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  payItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  payLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  payMethod: {
    color: 'var(--color-text-primary)',
  },
  payAmount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  payRefunded: {
    color: 'var(--color-error)',
  },
  refundList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    fontSize: '0.875rem',
  },
  refundItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    borderBottomWidth: {
      default: '1px',
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingBottom: {
      default: '0.625rem',
      ':last-child': 0,
    },
  },
  refundTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  refundWhen: {
    color: 'var(--color-text-secondary)',
  },
  refundAmount: {
    fontFamily: 'var(--font-family-code)',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-error)',
  },
  refundReason: {
    color: 'var(--color-text-primary)',
  },
  refundNoRestock: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  refundHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  refundHint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  timelineCard: {
    display: 'flex',
    height: 'fit-content',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  timelineList: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  timelineItem: {
    display: 'flex',
    gap: '0.75rem',
  },
  timelineRail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineDot: {
    marginTop: '0.25rem',
    height: '0.75rem',
    width: '0.75rem',
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
  timelineConnector: {
    width: '1px',
    flexGrow: 1,
    backgroundColor: 'var(--color-border)',
  },
  timelineBody: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.25rem',
  },
  timelineBodyPad: {
    paddingBottom: '1.25rem',
  },
  timelineWhen: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The status-dot fill per pill tone, for the vertical timeline rail. */
const TIMELINE_DOT: Record<Tone, stylex.StyleXStyles> = {
  ink: styles.dotInk,
  brand: styles.dotAccent,
  success: styles.dotSuccess,
  warning: styles.dotWarning,
  danger: styles.dotError,
  accent: styles.dotAccent,
  iris: styles.dotAccent,
  flame: styles.dotWarning,
};

/** One detail KPI card — icon tile, headline value, and label. */
function DetailKpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  /** StyleX colour style for the icon, on the brand tokens. */
  tone: stylex.StyleXStyles;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg, tone)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>{value}</p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
    </Card>
  );
}

/**
 * The order detail page (T4.4), rebuilt on Astryx Card/Badge + brand-tokened
 * StyleX (T11.22), keeping the layout the orders roster (T4.3) established: a
 * breadcrumb, a back link, an identity header card (order id + status/channel/
 * fulfilment badges), a four-tile KPI row (total / refunded / net / items), and
 * a two-rail body — items, payments and refunds in the main column, the
 * append-only status timeline in the side rail. `BillingManage` staff also get
 * the refund control while a refundable balance remains. Every figure comes from
 * `GET /orders/:id`; the timeline is the `OrderStatusEvent` log the API returns.
 * A `404` — unknown or cross-tenant id — becomes Next's `notFound()`; any other
 * failure surfaces inline.
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let order;
  try {
    order = await fetchOrder(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this order (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/orders" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} /> Back to orders
        </Link>
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const status = ORDER_STATUS_STYLES[order.status];
  const payment = order.payments[0];
  const refundable = refundableMinor(payment);

  const netMinor = Math.max(0, order.total - order.refundedAmount);
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const shortId = order.id.slice(0, 8);

  const session = await getServerSession();
  const canRefund = session !== null && roleHasPermission(session.role, Permission.BillingManage);

  return (
    <div {...stylex.props(styles.page)}>
      {/* Breadcrumb. */}
      <nav aria-label="Breadcrumb" {...stylex.props(styles.breadcrumb)}>
        <span>Iron Gym</span>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <Link href="/orders" {...stylex.props(styles.crumbLink)}>
          Orders
        </Link>
        <Icon name="chevronRight" {...stylex.props(styles.crumbIcon)} />
        <span {...stylex.props(styles.crumbCurrent)}>{shortId}</span>
      </nav>

      <Link href="/orders" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} /> Back to orders
      </Link>

      {/* Identity header card. */}
      <Card variant="default" padding={0} xstyle={styles.identityCard}>
        <div {...stylex.props(styles.identityLeft)}>
          <span {...stylex.props(styles.identityIcon)}>
            <Icon name="bag" {...stylex.props(styles.identityIconSvg)} />
          </span>
          <div {...stylex.props(styles.identityCol)}>
            <div {...stylex.props(styles.titleRow)}>
              <h1 {...stylex.props(styles.orderId)}>{order.id}</h1>
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone="ink">{CHANNEL_LABELS[order.channel]}</Badge>
              <Badge tone="ink">{FULFILLMENT_LABELS[order.fulfillment]}</Badge>
            </div>
            <div {...stylex.props(styles.metaRow)}>
              <span>{formatDateTime(order.createdAt)}</span>
              <span aria-hidden>·</span>
              <span>
                {order.customerName ?? (order.memberId ? `Member ${order.memberId}` : 'Walk-in')}
              </span>
            </div>
            {order.fulfillment === 'DELIVERY' && order.deliveryAddress && (
              <p {...stylex.props(styles.deliveryText)}>
                <span {...stylex.props(styles.deliveryLabel)}>Deliver to:</span>{' '}
                <span {...stylex.props(styles.deliveryAddress)}>{order.deliveryAddress}</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* KPI row. */}
      <section aria-label="Order metrics" {...stylex.props(styles.kpiGrid)}>
        <DetailKpi
          label="Order total"
          value={formatMoney(order.total, order.currency)}
          icon="card"
          tone={styles.kpiIconAccent}
        />
        <DetailKpi
          label="Refunded"
          value={formatMoney(order.refundedAmount, order.currency)}
          icon="arrowLeft"
          tone={styles.kpiIconError}
        />
        <DetailKpi
          label="Net kept"
          value={formatMoney(netMinor, order.currency)}
          icon="chart"
          tone={styles.kpiIconAccent}
        />
        <DetailKpi
          label={itemCount === 1 ? 'Item' : 'Items'}
          value={itemCount.toLocaleString()}
          icon="bag"
          tone={styles.kpiIconSuccess}
        />
      </section>

      {/* Two-rail body: items + payments + refunds in the main column, the status
          timeline in the side rail. */}
      <div {...stylex.props(styles.bodyGrid)}>
        <div {...stylex.props(styles.mainCol)}>
          {/* Items. */}
          <Card variant="default" padding={0} xstyle={styles.sectionCard}>
            <h2 {...stylex.props(styles.sectionTitle)}>Items</h2>
            {order.items.length === 0 ? (
              <p {...stylex.props(styles.mutedText)}>No line items.</p>
            ) : (
              <table {...stylex.props(styles.table)}>
                <thead>
                  <tr {...stylex.props(styles.headRow)}>
                    <th {...stylex.props(styles.th)}>Item</th>
                    <th {...stylex.props(styles.th, styles.alignRight)}>Qty</th>
                    <th {...stylex.props(styles.th, styles.thLast, styles.alignRight)}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} {...stylex.props(styles.bodyRow)}>
                      <td {...stylex.props(styles.td)}>{item.label}</td>
                      <td {...stylex.props(styles.td, styles.alignRight, styles.mono)}>
                        {item.qty}
                      </td>
                      <td
                        {...stylex.props(styles.td, styles.tdLast, styles.alignRight, styles.mono)}
                      >
                        {formatMoney(item.amount, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr {...stylex.props(styles.footRow)}>
                    <td colSpan={2} {...stylex.props(styles.footLabel)}>
                      Total
                    </td>
                    <td {...stylex.props(styles.footValue)}>
                      {formatMoney(order.total, order.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          <div {...stylex.props(styles.twoCol)}>
            {/* Payments. */}
            <Card variant="default" padding={0} xstyle={styles.sectionCard}>
              <h2 {...stylex.props(styles.sectionTitle)}>Payments</h2>
              {order.payments.length === 0 ? (
                <p {...stylex.props(styles.mutedText)}>No payment recorded.</p>
              ) : (
                <ul {...stylex.props(styles.payList)}>
                  {order.payments.map((pay) => {
                    const pillStatus = PAYMENT_STATUS_STYLES[pay.status];
                    return (
                      <li key={pay.id} {...stylex.props(styles.payItem)}>
                        <span {...stylex.props(styles.payLeft)}>
                          <Badge tone={pillStatus.tone}>{pillStatus.label}</Badge>
                          <span {...stylex.props(styles.payMethod)}>
                            {PAYMENT_METHOD_LABELS[pay.method]}
                          </span>
                        </span>
                        <span {...stylex.props(styles.payAmount)}>
                          {formatMoney(pay.amount, pay.currency)}
                          {pay.refundedAmount > 0 && (
                            <span {...stylex.props(styles.payRefunded)}>
                              {' '}
                              (−{formatMoney(pay.refundedAmount, pay.currency)})
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Refunds. */}
            <Card variant="default" padding={0} xstyle={styles.sectionCard}>
              <h2 {...stylex.props(styles.sectionTitle)}>Refunds</h2>
              {order.refunds.length === 0 ? (
                <p {...stylex.props(styles.mutedText)}>No refunds issued.</p>
              ) : (
                <ul {...stylex.props(styles.refundList)}>
                  {order.refunds.map((refund) => (
                    <li key={refund.id} {...stylex.props(styles.refundItem)}>
                      <div {...stylex.props(styles.refundTop)}>
                        <span {...stylex.props(styles.refundWhen)}>
                          {formatDateTime(refund.createdAt)}
                        </span>
                        <span {...stylex.props(styles.refundAmount)}>
                          −{formatMoney(refund.amount, order.currency)}
                        </span>
                      </div>
                      <span {...stylex.props(styles.refundReason)}>{refund.reason}</span>
                      {!refund.restockItems && (
                        <span {...stylex.props(styles.refundNoRestock)}>Items not restocked</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Refund control — BillingManage staff, while a balance remains. */}
          {canRefund && refundable > 0 && payment && (
            <Card variant="default" padding={0} xstyle={styles.sectionCard}>
              <div {...stylex.props(styles.refundHead)}>
                <h2 {...stylex.props(styles.sectionTitle)}>Issue a refund</h2>
                <p {...stylex.props(styles.refundHint)}>
                  Up to {formatMoney(refundable, order.currency)} remaining on this order.
                </p>
              </div>
              <RefundForm
                orderId={order.id}
                currency={order.currency}
                refundableMinor={refundable}
              />
            </Card>
          )}
        </div>

        {/* Status timeline (side rail). */}
        <Card variant="default" padding={0} xstyle={styles.timelineCard}>
          <h2 {...stylex.props(styles.sectionTitle)}>Status timeline</h2>
          {order.statusTimeline.length === 0 ? (
            <p {...stylex.props(styles.mutedText)}>No status history.</p>
          ) : (
            <ol {...stylex.props(styles.timelineList)}>
              {order.statusTimeline.map((entry, index) => {
                const pill = ORDER_STATUS_STYLES[entry.status];
                const isLast = index === order.statusTimeline.length - 1;
                return (
                  <li
                    key={`${entry.status}-${entry.at}-${index}`}
                    {...stylex.props(styles.timelineItem)}
                  >
                    {/* Rail: dot + connector to the next entry. */}
                    <div {...stylex.props(styles.timelineRail)}>
                      <span {...stylex.props(styles.timelineDot, TIMELINE_DOT[pill.tone])} />
                      {!isLast && <span aria-hidden {...stylex.props(styles.timelineConnector)} />}
                    </div>
                    <div {...stylex.props(styles.timelineBody, !isLast && styles.timelineBodyPad)}>
                      <Badge tone={pill.tone}>{pill.label}</Badge>
                      <span {...stylex.props(styles.timelineWhen)}>{formatDateTime(entry.at)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
