'use client';

// @fit/admin — billing-plans board (formacore `billing-plans` artboard, T5.1).
//
// The Billing → Plans screen: the gym's recurring membership plans laid out as
// cards, split into Active / Archived, above a KPI strip (active plans, live
// subscribers, MRR, average revenue per member). Each card shows the price + a
// per-interval suffix, the freeze allowance, the perk (feature) list, and the
// plan's live subscriber count + its monthly-recurring contribution. Staff who
// hold `BillingManage` can archive/restore a plan inline with the footer switch
// and jump to its editor; a read-only (`BillingRead`) role gets the same board
// without those affordances.
//
// The plan catalogue is server-rendered (props); this component owns only the
// Active/Archived view toggle and the archive mutation. Toggling calls the
// `setSubscriptionPlanActiveAction` server action and `router.refresh()`es to pull
// the authoritative catalogue back — mirroring how the locations board mutates —
// so the cards, segment counts and KPIs all re-derive from one source of truth.

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminSubscriptionPlanRow } from '@fit/types';
import {
  Badge,
  Card,
  Icon,
  Switch,
  buttonClasses,
  useToast,
  type IconName,
  type Tone,
} from '@/components/ui';
import { setSubscriptionPlanActiveAction } from './actions';
import { formatPrice, intervalSuffix } from './format';

type Segment = 'active' | 'archived';

/** Months in a year — normalises a yearly price to a monthly-recurring figure. */
const MONTHS_PER_YEAR = 12;

/** The accent palette cycled across plan cards (dot swatch + soft glow), by index. */
const PLAN_TONES: readonly Tone[] = ['iris', 'accent', 'brand', 'success', 'warning'];

/** Literal dot classes per tone (Tailwind can't see `bg-${tone}-500` built inline). */
const TONE_DOT: Record<Tone, string> = {
  ink: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  accent: 'bg-accent-500',
  iris: 'bg-iris-500',
  flame: 'bg-flame-500',
};

/** The KPI tiles, in display order — each a literal icon + accent text class. */
const KPI_ICON_CLASS: Record<'activePlans' | 'subscribers' | 'mrr' | 'avgPerMember', string> = {
  activePlans: 'text-brand-500 dark:text-brand-400',
  subscribers: 'text-accent-500 dark:text-accent-400',
  mrr: 'text-success-600 dark:text-success-400',
  avgPerMember: 'text-iris-500 dark:text-iris-400',
};

/** The monthly-normalised price of a plan in the currency's minor units. */
function monthlyMinor(plan: AdminSubscriptionPlanRow): number {
  return plan.interval === 'YEAR' ? plan.priceAmount / MONTHS_PER_YEAR : plan.priceAmount;
}

/** A plan's monthly-recurring contribution: its normalised price × live subscribers. */
function planMonthlyRevenue(plan: AdminSubscriptionPlanRow): number {
  return monthlyMinor(plan) * plan.subscriberCount;
}

/** Pick a stable accent tone for a plan card by its position in the list. */
function toneAt(index: number): Tone {
  return PLAN_TONES[index % PLAN_TONES.length] ?? 'ink';
}

/**
 * The billing-plans board. `plans` is the gym's full catalogue (active + archived);
 * `canWrite` gates the archive switch and the new/edit links behind `BillingManage`.
 */
export function BillingPlansView({
  plans,
  canWrite,
}: {
  plans: AdminSubscriptionPlanRow[];
  canWrite: boolean;
}) {
  const t = useTranslations('admin.billingPlans');
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<Segment>('active');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activePlans = useMemo(() => plans.filter((p) => p.status === 'ACTIVE'), [plans]);
  const archivedPlans = useMemo(() => plans.filter((p) => p.status !== 'ACTIVE'), [plans]);
  const shown = view === 'active' ? activePlans : archivedPlans;

  // KPIs describe the whole catalogue, not the current segment. MRR + subscribers
  // count every live subscriber, even on an archived plan (deactivating a plan
  // never cancels its live subscriptions).
  const currency = plans[0]?.currency ?? 'USD';
  const totalSubscribers = plans.reduce((sum, p) => sum + p.subscriberCount, 0);
  const totalMrrMinor = plans.reduce((sum, p) => sum + planMonthlyRevenue(p), 0);
  const avgPerMemberMinor = totalSubscribers > 0 ? Math.round(totalMrrMinor / totalSubscribers) : 0;

  const kpis: ReadonlyArray<{
    key: keyof typeof KPI_ICON_CLASS;
    icon: IconName;
    value: string;
  }> = [
    { key: 'activePlans', icon: 'ticket', value: activePlans.length.toLocaleString() },
    { key: 'subscribers', icon: 'users', value: totalSubscribers.toLocaleString() },
    { key: 'mrr', icon: 'card', value: formatPrice(Math.round(totalMrrMinor), currency) },
    { key: 'avgPerMember', icon: 'chart', value: formatPrice(avgPerMemberMinor, currency) },
  ];

  function toggleActive(plan: AdminSubscriptionPlanRow): void {
    const nextActive = plan.status !== 'ACTIVE';
    setBusyId(plan.id);
    startTransition(async () => {
      const result = await setSubscriptionPlanActiveAction(plan.id, nextActive);
      setBusyId(null);
      if (result.ok) {
        toast(
          nextActive
            ? t('toastRestored', { name: plan.name })
            : t('toastArchived', { name: plan.name }),
          { tone: nextActive ? 'success' : 'ink', icon: nextActive ? 'check' : 'x' },
        );
        router.refresh();
      } else {
        toast(result.error || t('toastError'), { tone: 'danger', icon: 'info' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-tabs — only Plans is a live surface this milestone. */}
      <div className="flex items-center gap-5 border-b border-ink-200 dark:border-white/10">
        <span className="relative pb-2.5 text-sm font-semibold text-ink-900 dark:text-white">
          {t('tabs.plans')}
          <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-[linear-gradient(135deg,#7C3AED,#EC4899)]" />
        </span>
        <span className="pb-2.5 text-sm font-semibold text-ink-400 dark:text-ink-500">
          {t('tabs.promos')}
        </span>
        <span className="pb-2.5 text-sm font-semibold text-ink-400 dark:text-ink-500">
          {t('tabs.ptPackages')}
        </span>
      </div>

      {/* KPI strip. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.key} className="p-4 sm:p-5">
            <Icon name={kpi.icon} className={`h-5 w-5 ${KPI_ICON_CLASS[kpi.key]}`} />
            <div className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
              {kpi.value}
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
              {t(`kpi.${kpi.key}`)}
            </div>
          </Card>
        ))}
      </div>

      {/* Segment + count, and the New plan action. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-btn p-1 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.06] dark:ring-white/10">
          {(['active', 'archived'] as const).map((segment) => (
            <button
              key={segment}
              type="button"
              onClick={() => setView(segment)}
              className={[
                'inline-flex h-9 items-center gap-1.5 rounded-[7px] px-3.5 text-sm font-semibold transition',
                view === segment
                  ? 'bg-white text-ink-900 shadow-sm dark:text-ink-900'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white',
              ].join(' ')}
            >
              {t(`segment.${segment}`)}
              <span className="font-mono text-[11px] tabular-nums text-ink-400">
                {segment === 'active' ? activePlans.length : archivedPlans.length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
            {t('planCount', { count: shown.length })}
          </span>
          {canWrite ? (
            <Link href="/subscriptions/new" className={buttonClasses('primary', 'sm')}>
              <Icon name="plus" className="h-4 w-4" />
              {t('newPlan')}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Plan cards, or the segment's empty state. */}
      {shown.length === 0 ? (
        <Card className="px-4 py-16 text-center">
          <Icon name="ticket" className="mx-auto h-9 w-9 text-ink-300 dark:text-ink-600" sw={1.8} />
          <p className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-white">
            {view === 'active' ? t('emptyActiveTitle') : t('emptyArchivedTitle')}
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {view === 'active' ? t('emptyActiveBody') : t('emptyArchivedBody')}
          </p>
        </Card>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
            isPending ? 'opacity-70 transition-opacity' : ''
          }`}
        >
          {shown.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              tone={toneAt(index)}
              canWrite={canWrite}
              busy={busyId === plan.id}
              onToggle={() => toggleActive(plan)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One membership plan rendered as a formacore billing card. */
function PlanCard({
  plan,
  tone,
  canWrite,
  busy,
  onToggle,
  t,
}: {
  plan: AdminSubscriptionPlanRow;
  tone: Tone;
  canWrite: boolean;
  busy: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isActive = plan.status === 'ACTIVE';
  const features = plan.features;

  return (
    <Card className={`flex flex-col p-5 ${isActive ? '' : 'opacity-75'}`}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-sm ${TONE_DOT[tone]}`} />
          <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
            {plan.name}
          </h3>
          {plan.popular ? (
            <Badge tone="iris" icon="star">
              {t('popular')}
            </Badge>
          ) : null}
        </div>
        {canWrite ? (
          <Link
            href={`/subscriptions/${plan.id}`}
            className={buttonClasses('ghost', 'sm')}
            aria-label={t('edit')}
          >
            {t('edit')}
          </Link>
        ) : null}
      </div>

      {/* price */}
      <div className="mt-3 flex items-end gap-1">
        <span className="font-display text-3xl font-black tabular-nums tracking-tight text-ink-900 dark:text-white">
          {formatPrice(plan.priceAmount, plan.currency)}
        </span>
        <span className="mb-1 text-sm font-semibold text-ink-500 dark:text-ink-400">
          {intervalSuffix(plan.interval)}
        </span>
      </div>

      {/* freeze allowance */}
      {plan.freezeDaysPerPeriod > 0 ? (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <span className="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:text-ink-300 dark:ring-white/10">
            <Icon name="clock" className="h-3 w-3" sw={2} />
            {t('freeze', { days: plan.freezeDaysPerPeriod })}
          </span>
        </div>
      ) : null}

      {/* perks */}
      <div className="mt-3.5 flex-1 space-y-1.5">
        {features.length === 0 ? (
          <p className="text-sm text-ink-400 dark:text-ink-500">{t('perksNone')}</p>
        ) : (
          features.slice(0, 4).map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300"
            >
              <Icon
                name="check"
                className="h-4 w-4 shrink-0 text-success-600 dark:text-success-300"
                sw={2.6}
              />
              {feature}
            </div>
          ))
        )}
      </div>

      {/* footer — subscribers, monthly contribution, live toggle */}
      <div className="mt-4 flex items-center gap-3 border-t border-ink-200 pt-4 dark:border-white/10">
        <div>
          <div className="font-display text-base font-extrabold tabular-nums text-ink-900 dark:text-white">
            {plan.subscriberCount.toLocaleString()}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
            {t('subscribersLabel')}
          </div>
        </div>
        <div className="border-l border-ink-200 pl-3 dark:border-white/10">
          <div className="font-display text-base font-extrabold tabular-nums text-ink-900 dark:text-white">
            {formatPrice(Math.round(planMonthlyRevenue(plan)), plan.currency)}
          </div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 dark:text-ink-400">
            {t('monthlyLabel')}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${
              isActive ? 'text-success-700 dark:text-success-300' : 'text-ink-400 dark:text-ink-500'
            }`}
          >
            {isActive ? t('live') : t('off')}
          </span>
          {canWrite ? (
            <Switch
              checked={isActive}
              onChange={busy ? () => undefined : onToggle}
              label={isActive ? t('off') : t('live')}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
