import type { Metadata } from 'next';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { fetchMembership } from '@/lib/membership';
import { fetchMyCreditPacks, totalRemainingCredits } from '@/lib/credit-packs';
import { fetchMemberBookings } from '@/lib/member-bookings';
import { formatMoney } from '@/lib/shop';
import { Badge, buttonClasses, Card, Icon, Progress } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';

export const metadata: Metadata = { title: 'Membership — Fit' };
export const dynamic = 'force-dynamic';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

const STATUS_TONE = {
  ACTIVE: 'success',
  FROZEN: 'iris',
  CANCELED: 'ink',
  PAST_DUE: 'warning',
  EXPIRED: 'ink',
} as const;

export default async function MembershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, activeLocale, { subscription, invoices }, creditPacks, bookings] = await Promise.all([
    getTranslations('member.membership'),
    getLocale(),
    safe(fetchMembership(), { subscription: null, invoices: [] }),
    safe(fetchMyCreditPacks(), []),
    safe(fetchMemberBookings({ scope: 'all' }), [] as MemberBookingHistoryEntry[]),
  ]);

  const credits = totalRemainingCredits(creditPacks);
  const attended = bookings.filter((b) => b.status === 'ATTENDED').length;
  // Best available plan signal until GET /me/subscription ships: the most recent
  // credit-pack's plan title.
  const planName = subscription?.planName ?? creditPacks[0]?.planTitle ?? null;
  const hasMembership = subscription !== null || planName !== null;
  const status = subscription?.status ?? (planName ? 'ACTIVE' : 'EXPIRED');

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(activeLocale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <Link href="/checkout" className={buttonClasses('primary', 'md')}>
          {hasMembership ? t('changePlan') : t('choosePlan')}
        </Link>
      </div>

      {status === 'PAST_DUE' ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-amber-300/70 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-amber-400/25">
            <Icon name="card" className="h-4 w-4" sw={2.3} />
          </span>
          <div>
            <p className="font-display text-sm font-bold">{t('pastDue.title')}</p>
            <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/80">
              {t('pastDue.body')}
            </p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Current plan */}
        <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#7C3AED,#EC4899)] p-6 text-white shadow-[0_24px_60px_-24px_rgba(80,68,210,0.8)] sm:p-7">
          <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/15 blur-3xl" />
          <div className="relative flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-btn bg-white/15">
              <Icon name="ticket" className="h-5 w-5" sw={2.3} />
            </span>
            <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>
          </div>
          <p className="relative mt-5 font-display text-3xl font-extrabold tracking-tight">
            {planName ?? t('noPlan')}
          </p>
          {hasMembership ? (
            <>
              <p className="relative mt-1 text-sm text-white/80">{t('perks')}</p>
              <div className="relative mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div>
                  <p className="text-white/60">{t('nextBilling')}</p>
                  <p className="font-semibold">
                    {fmtDate(subscription?.currentPeriodEnd ?? null)}
                    {subscription
                      ? ` · ${formatMoney(subscription.priceAmount, subscription.currency, activeLocale)}`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">{t('memberSince')}</p>
                  <p className="font-semibold">{fmtDate(subscription?.memberSince ?? null)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="relative mt-2 text-sm text-white/80">{t('noPlanHint')}</p>
          )}
        </div>

        {/* Actions */}
        <Card glow className="flex flex-col gap-2 p-5 sm:p-6">
          <Link href="/checkout" className={buttonClasses('outline', 'md', 'w-full justify-start')}>
            <Icon name="ticket" className="h-4 w-4" />{' '}
            {hasMembership ? t('changePlan') : t('choosePlan')}
          </Link>
          <Link
            href="/account/bookings"
            className={buttonClasses('ghost', 'md', 'w-full justify-start')}
          >
            <Icon name="calendar" className="h-4 w-4" /> {t('viewBookings')}
          </Link>
          <Link href="/shop" className={buttonClasses('ghost', 'md', 'w-full justify-start')}>
            <Icon name="bag" className="h-4 w-4" /> {t('shopMember')}
          </Link>
        </Card>
      </section>

      {/* Metrics */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-ink-500 dark:text-ink-400">
            <Icon name="card" className="h-5 w-5" />
            <p className="text-xs font-semibold uppercase tracking-wide">{t('paymentMethod')}</p>
          </div>
          <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
            {t('payAtDesk')}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-ink-500 dark:text-ink-400">
            <Icon name="spark" className="h-5 w-5" />
            <p className="text-xs font-semibold uppercase tracking-wide">{t('thisPeriod')}</p>
          </div>
          <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
            {attended} <span className="text-sm font-medium text-ink-400">{t('classes')}</span>
          </p>
          <Progress value={Math.min(100, attended * 8)} className="mt-3" tone="bg-brand-500" />
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-ink-500 dark:text-ink-400">
            <Icon name="dumbbell" className="h-5 w-5" />
            <p className="text-xs font-semibold uppercase tracking-wide">{t('ptCredits')}</p>
          </div>
          <p className="mt-3 font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
            {credits}
          </p>
          <Link
            href="/trainers"
            className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            {t('buyMore')}
          </Link>
        </Card>
      </section>

      {/* Invoices */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
            {t('invoices')}
          </h2>
        </div>
        {invoices.length > 0 ? (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left dark:border-white/10">
                  {['invoice', 'date', 'amount', 'statusCol'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400"
                    >
                      {t(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-ink-50 last:border-0 dark:border-white/5"
                  >
                    <td className="px-5 py-3 font-mono text-ink-700 dark:text-ink-200">{inv.id}</td>
                    <td className="px-5 py-3 text-ink-600 dark:text-ink-300">
                      {new Date(inv.date).toLocaleDateString(activeLocale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3 font-mono tabular-nums text-ink-900 dark:text-white">
                      {formatMoney(inv.amount, inv.currency, activeLocale)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          inv.status === 'PAID'
                            ? 'success'
                            : inv.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {t(`invoiceStatus.${inv.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <Card className="grid place-items-center gap-2 py-10 text-center">
            <Icon name="download" className="h-7 w-7 text-ink-300 dark:text-ink-600" />
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('noInvoices')}</p>
          </Card>
        )}
      </section>
    </div>
  );
}
