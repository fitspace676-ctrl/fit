import type { Metadata } from 'next';
import { Badge, ButtonLink, Card, Meter, type BadgeTone } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { fetchMembership } from '@/lib/membership';
import {
  fetchCreditPackCatalogue,
  fetchMyCreditPacks,
  totalRemainingCredits,
} from '@/lib/credit-packs';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { formatMoney } from '@/lib/shop';
import { Icon } from '@/src/components/ui';
import { FreezeCard } from './freeze-card';
import { BuyCreditsCard } from './buy-credits-card';
import { createDateTimeFormat } from '@fit/i18n';

// Astryx migration (T11), now on the portal kit: the member membership screen is rebuilt on the
// Astryx design system over the FormaCore theme. The status badge, the gradient
// plan card, the manage-plan / metrics / invoices sections use Astryx
// Card / Badge / Button / ProgressBar; all layout is compiled StyleX
// (`var(--color-*)`), no Tailwind utilities. Live membership (GET
// /me/subscription) remains the single source of truth and the invoice download
// proxy (`/api/invoices/:id`) is unchanged.

export const metadata: Metadata = { title: 'Membership - FormaCore' };
export const dynamic = 'force-dynamic';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/**
 * The chip tone for each subscription status.
 *
 * The direction reduces sentiment to three signals, so five statuses collapse
 * onto three tones rather than onto five hues: a live plan is `positive` (the
 * lime), anything waiting or wound down is `pending` (ink), and a failed payment
 * is the one red. TRIAL used to be purple and FROZEN blue — both rendered as
 * grey anyway, because the theme flattens every categorical hue onto ink.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  TRIAL: 'positive',
  ACTIVE: 'positive',
  FROZEN: 'pending',
  CANCELED: 'pending',
  PAST_DUE: 'danger',
  EXPIRED: 'pending',
};

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  alert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-orange)',
    backgroundColor: 'var(--color-warning-muted)',
    padding: '1rem',
  },
  alertIcon: {
    marginTop: '0.125rem',
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'color-mix(in srgb, var(--color-warning) 25%, transparent)',
    color: 'var(--color-text-orange)',
  },
  alertTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-orange)',
  },
  alertBody: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  twoCol: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '1.5fr 1fr',
    },
    alignItems: 'start',
  },
  // The lime block again — the same surface as the dashboard's `MembershipHero`,
  // at the scale this screen gives it. Flat fill, ink type, hero radius; the
  // gradient, the blurred "aura" and the coloured drop shadow are gone with the
  // Aurora-glass skin. Type on lime is ALWAYS ink — see the note in
  // `membership-hero.tsx` for why these are literals rather than theme tokens.
  planCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-accent)',
    padding: '1.75rem',
    color: '#131312',
  },
  planTop: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
  },
  planTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    width: '2.25rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'rgba(19, 19, 18, 0.12)',
  },
  planTileIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  // The status badge is the block's one inverted element. Left at its theme
  // variant it would render lime-on-lime (`ACTIVE` maps to `success`, which the
  // direction defines AS the lime) and disappear; solid ink is how the artboards
  // draw it.
  planBadge: {
    marginLeft: 'auto',
    backgroundColor: '#131312',
    color: '#FFFFFF',
    borderColor: 'transparent',
  },
  // NOTE — every `<p>` / heading on a lime block must state its colour.
  // The theme's reset carries `:where(p) { color: var(--color-text-primary) }`,
  // which in dark mode is white. It has zero specificity but it still beats
  // plain inheritance, so a paragraph inside the block does NOT pick up the
  // block's ink: it goes white on lime (~1.5:1) unless told otherwise.
  planName: {
    position: 'relative',
    margin: 0,
    marginTop: '1.5rem',
    color: '#131312',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(2.25rem, 5vw, 3rem)',
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: '-0.03em',
    textTransform: 'uppercase',
  },
  planPerks: {
    position: 'relative',
    margin: 0,
    marginTop: '0.625rem',
    fontSize: '0.875rem',
    color: 'rgba(19, 19, 18, 0.76)',
  },
  planMetaRow: {
    position: 'relative',
    marginTop: '1.75rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem 2rem',
    fontSize: '0.875rem',
  },
  metaLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'rgba(19, 19, 18, 0.62)',
  },
  metaValue: {
    margin: 0,
    marginTop: '0.25rem',
    color: '#131312',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.9375rem',
    fontWeight: 600,
  },
  metaNote: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.75rem',
    color: 'rgba(19, 19, 18, 0.62)',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '1.5rem',
  },
  actionsLabel: {
    margin: 0,
    marginBottom: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  fullStart: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  metrics: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(3, 1fr)',
    },
    alignItems: 'start',
  },
  metricCard: {
    padding: '1.25rem',
  },
  metricHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--color-text-secondary)',
  },
  metricIcon: {
    height: '1.25rem',
    width: '1.25rem',
  },
  metricLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricValue: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  metricBig: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  metricUnit: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  progressWrap: {
    marginTop: '0.75rem',
  },
  invoicesHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  invoicesTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  tableWrap: {
    overflowX: 'auto',
    padding: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    textAlign: 'left',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  td: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  tdMono: {
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-primary)',
  },
  tdAmount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  emptyInvoices: {
    display: 'grid',
    placeItems: 'center',
    gap: '0.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    height: '1.75rem',
    width: '1.75rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  glyph: {
    height: '1rem',
    width: '1rem',
  },
});

function invoiceTone(status: string): BadgeTone {
  if (status === 'PAID') return 'positive';
  if (status === 'FAILED') return 'danger';
  return 'pending';
}

export default async function MembershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, activeLocale, { subscription, invoices }, creditPacks, catalogue, bookings] =
    await Promise.all([
      getTranslations('member.membership'),
      getLocale(),
      safe(fetchMembership(), { subscription: null, invoices: [] }),
      safe(fetchMyCreditPacks(), []),
      safe(fetchCreditPackCatalogue(), []),
      safe(fetchMemberBookings({ scope: 'all' }), [] as MemberBookingHistoryEntry[]),
    ]);

  const credits = totalRemainingCredits(creditPacks);
  const attended = bookings.filter((b) => b.status === 'ATTENDED').length;
  // Live membership (GET /me/subscription) is the single source of truth: plan,
  // status, billing dates and freeze allowance all come straight off the wire.
  const hasMembership = subscription !== null;
  const planName = subscription?.planName ?? null;
  const status = subscription?.status ?? 'EXPIRED';
  // Only a live subscription that isn't flagged to cancel actually bills again; a
  // pending-cancel or terminal (canceled/expired) one rides out — or is past — its
  // paid period, so we show an "access until" date, never a future charge.
  const terminal = status === 'CANCELED' || status === 'EXPIRED';
  const pendingCancel = subscription?.cancelAtPeriodEnd ?? false;
  const renewing = hasMembership && !pendingCancel && !terminal;

  const fmtDate = (iso: string | null) =>
    iso
      ? createDateTimeFormat(activeLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(iso))
      : '—';

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.head)}>
        <div>
          <p {...stylex.props(styles.eyebrow)}>{t('eyebrow')}</p>
          <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        </div>
        <ButtonLink
          href="/member/checkout"
          variant="primary"
          size="card"
          label={hasMembership ? t('changePlan') : t('choosePlan')}
        />
      </div>

      {status === 'PAST_DUE' ? (
        <div role="alert" {...stylex.props(styles.alert)}>
          <span {...stylex.props(styles.alertIcon)}>
            <Icon name="card" {...stylex.props(styles.glyph)} sw={2.3} />
          </span>
          <div>
            <p {...stylex.props(styles.alertTitle)}>{t('pastDue.title')}</p>
            <p {...stylex.props(styles.alertBody)}>{t('pastDue.body')}</p>
          </div>
        </div>
      ) : null}

      <section {...stylex.props(styles.twoCol)}>
        {/* Current plan */}
        <div {...stylex.props(styles.planCard)}>
          <div {...stylex.props(styles.planTop)}>
            <span {...stylex.props(styles.planTile)}>
              <Icon name="ticket" {...stylex.props(styles.planTileIcon)} sw={2.3} />
            </span>
            {hasMembership ? (
              <Badge
                tone={STATUS_TONE[status] ?? 'neutral'}
                label={t(`status.${status}`)}
                xstyle={styles.planBadge}
              />
            ) : null}
          </div>
          <p {...stylex.props(styles.planName)}>{planName ?? t('noPlan')}</p>
          {subscription ? (
            <>
              <p {...stylex.props(styles.planPerks)}>{t('perks')}</p>
              <div {...stylex.props(styles.planMetaRow)}>
                <div>
                  <p {...stylex.props(styles.metaLabel)}>
                    {renewing ? t('nextBilling') : t('endsOn')}
                  </p>
                  <p {...stylex.props(styles.metaValue)}>
                    {fmtDate(subscription.currentPeriodEnd)}
                    {renewing
                      ? ` · ${formatMoney(subscription.priceAmount, subscription.currency, activeLocale)}`
                      : ''}
                  </p>
                  {pendingCancel ? (
                    <p {...stylex.props(styles.metaNote)}>{t('cancelNotice')}</p>
                  ) : null}
                </div>
                <div>
                  <p {...stylex.props(styles.metaLabel)}>{t('memberSince')}</p>
                  <p {...stylex.props(styles.metaValue)}>{fmtDate(subscription.memberSince)}</p>
                </div>
              </div>
            </>
          ) : (
            <p {...stylex.props(styles.planPerks)}>{t('noPlanHint')}</p>
          )}
        </div>

        {/* Actions */}
        <Card padding="none">
          <div {...stylex.props(styles.actions)}>
            <p {...stylex.props(styles.actionsLabel)}>{t('managePlan')}</p>
            <ButtonLink
              href="/member/checkout"
              variant="secondary"
              size="card"
              icon={<Icon name="ticket" {...stylex.props(styles.glyph)} />}
              label={hasMembership ? t('changePlan') : t('choosePlan')}
              xstyle={styles.fullStart}
            />
            <ButtonLink
              href="/member/account/bookings"
              variant="ghost"
              size="card"
              icon={<Icon name="calendar" {...stylex.props(styles.glyph)} />}
              label={t('viewBookings')}
              xstyle={styles.fullStart}
            />
            <ButtonLink
              href="/member/shop"
              variant="ghost"
              size="card"
              icon={<Icon name="bag" {...stylex.props(styles.glyph)} />}
              label={t('shopMember')}
              xstyle={styles.fullStart}
            />
          </div>
        </Card>
      </section>

      {/* Freeze / pause membership (T5.7) — only for a real, live subscription. */}
      {subscription ? (
        <section {...stylex.props(styles.twoCol)}>
          <FreezeCard
            id={subscription.id}
            status={subscription.status}
            frozenUntil={subscription.frozenUntil}
            freezeDaysPerPeriod={subscription.freezeDaysPerPeriod}
            freezeDaysUsed={subscription.freezeDaysUsed}
            freezeDaysRemaining={subscription.freezeDaysRemaining}
          />
        </section>
      ) : null}

      {/* Metrics */}
      <section {...stylex.props(styles.metrics)}>
        <Card padding="none" xstyle={styles.metricCard}>
          <div {...stylex.props(styles.metricHead)}>
            <Icon name="card" {...stylex.props(styles.metricIcon)} />
            <p {...stylex.props(styles.metricLabel)}>{t('paymentMethod')}</p>
          </div>
          <p {...stylex.props(styles.metricValue)}>{t('payAtDesk')}</p>
        </Card>
        <Card padding="none" xstyle={styles.metricCard}>
          <div {...stylex.props(styles.metricHead)}>
            <Icon name="spark" {...stylex.props(styles.metricIcon)} />
            <p {...stylex.props(styles.metricLabel)}>{t('thisPeriod')}</p>
          </div>
          <p {...stylex.props(styles.metricBig)}>
            {attended} <span {...stylex.props(styles.metricUnit)}>{t('classes')}</span>
          </p>
          <div {...stylex.props(styles.progressWrap)}>
            <Meter
              value={Math.min(100, attended * 8)}
              max={100}
              label={t('thisPeriod')}
              showHeader={false}
            />
          </div>
        </Card>
        <BuyCreditsCard credits={credits} catalogue={catalogue} />
      </section>

      {/* Invoices */}
      <section>
        <div {...stylex.props(styles.invoicesHead)}>
          <h2 {...stylex.props(styles.invoicesTitle)}>{t('invoices')}</h2>
        </div>
        {invoices.length > 0 ? (
          <Card padding="none" xstyle={styles.tableWrap}>
            <table {...stylex.props(styles.table)}>
              <thead>
                <tr>
                  {['invoice', 'date', 'amount', 'statusCol', 'downloadCol'].map((h) => (
                    <th key={h} {...stylex.props(styles.th)}>
                      {t(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td {...stylex.props(styles.td, styles.tdMono)}>{inv.id}</td>
                    <td {...stylex.props(styles.td)}>
                      {createDateTimeFormat(activeLocale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(inv.date))}
                    </td>
                    <td {...stylex.props(styles.td, styles.tdAmount)}>
                      {formatMoney(inv.amount, inv.currency, activeLocale)}
                    </td>
                    <td {...stylex.props(styles.td)}>
                      <Badge
                        tone={invoiceTone(inv.status)}
                        label={t(`invoiceStatus.${inv.status}`)}
                      />
                    </td>
                    <td {...stylex.props(styles.td)}>
                      {/* Not a localized <Link>: the download proxy lives at the
                          locale-less `/api/invoices/:id` route handler. */}
                      <ButtonLink
                        href={`/api/invoices/${inv.id}`}
                        variant="ghost"
                        size="inline"
                        icon={<Icon name="download" {...stylex.props(styles.glyph)} />}
                        label={t('download')}
                        aria-label={t('downloadPdf')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card padding="none">
            <div {...stylex.props(styles.emptyInvoices)}>
              <Icon name="download" {...stylex.props(styles.emptyIcon)} />
              <p {...stylex.props(styles.emptyText)}>{t('noInvoices')}</p>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
