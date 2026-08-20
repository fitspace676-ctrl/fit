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
import { ButtonLink } from '@/components/ui/button-link';
import * as stylex from '@stylexjs/stylex';
import { DEFAULT_CURRENCY } from '@fit/types';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AdminSubscriptionPlanRow } from '@fit/types';
import { Badge, Card, Switch, type BadgeTone } from '@fit/ui-kit';
import { Icon, useToast, type IconName } from '@/components/ui';
import { setSubscriptionPlanActiveAction } from './actions';
import { formatPrice, intervalSuffix } from './format';
import { NewPlanDrawer } from './new-plan-drawer';
import type { PlanClassTypeOption } from './subscription-plan-form';
import { createNumberFormat, defaultLocale } from '@fit/i18n';

type Segment = 'active' | 'archived';

/** Months in a year — normalises a yearly price to a monthly-recurring figure. */
const MONTHS_PER_YEAR = 12;

/** An archived plan reads as receded — the one rule this file needs in StyleX. */
const cardStyles = stylex.create({
  archived: { opacity: 0.75 },
});

const TONE_DOT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-400',
  positive: 'bg-brand-500',
  pending: 'bg-ink-500',
  danger: 'bg-danger-500',
  accent: 'bg-brand-500',
};

/**
 * The KPI tiles' icon colour.
 *
 * One class, not four. This was a colour per tile — brand, accent, success and
 * `iris`, the last surviving trace of the retired Aurora indigo — which encoded
 * nothing: the four numbers are not four kinds of thing, and the icons already
 * differ by glyph. The direction gives every icon the same ink and spends the
 * accent on state.
 */
const KPI_ICON_CLASS = 'text-ink-400 dark:text-ink-500';

/** The monthly-normalised price of a plan in the currency's minor units. */
function monthlyMinor(plan: AdminSubscriptionPlanRow): number {
  return plan.interval === 'YEAR' ? plan.priceAmount / MONTHS_PER_YEAR : plan.priceAmount;
}

/** A plan's monthly-recurring contribution: its normalised price × live subscribers. */
function planMonthlyRevenue(plan: AdminSubscriptionPlanRow): number {
  return monthlyMinor(plan) * plan.subscriberCount;
}

/**
 * The tone for a plan card.
 *
 * Plan cards no longer cycle a rainbow. This was five hues dealt out by card
 * INDEX (`['iris', 'accent', 'brand', 'success', 'warning']`) with a matching dot
 * and a soft glow — decoration that looked like information: the colour encoded a
 * plan's position in the list, so it changed when a plan was added and told a
 * reader nothing either way.
 *
 * The direction spends its one chromatic voice on state, so the accent marks the
 * ACTIVE plan and every other card is ink.
 */
function toneFor(isActive: boolean): BadgeTone {
  return isActive ? 'accent' : 'neutral';
}

/**
 * The billing-plans board. `plans` is the gym's full catalogue (active + archived);
 * `canWrite` gates the archive switch and the new/edit links behind `BillingManage`.
 */
export function BillingPlansView({
  plans,
  classTypes,
  canWrite,
}: {
  plans: AdminSubscriptionPlanRow[];
  classTypes: PlanClassTypeOption[];
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
  const currency = plans[0]?.currency ?? DEFAULT_CURRENCY;
  const totalSubscribers = plans.reduce((sum, p) => sum + p.subscriberCount, 0);
  const totalMrrMinor = plans.reduce((sum, p) => sum + planMonthlyRevenue(p), 0);
  const avgPerMemberMinor = totalSubscribers > 0 ? Math.round(totalMrrMinor / totalSubscribers) : 0;

  const kpis: ReadonlyArray<{
    key: 'activePlans' | 'subscribers' | 'mrr' | 'avgPerMember';
    icon: IconName;
    value: string;
  }> = [
    {
      key: 'activePlans',
      icon: 'ticket',
      value: createNumberFormat(defaultLocale).format(activePlans.length),
    },
    {
      key: 'subscribers',
      icon: 'users',
      value: createNumberFormat(defaultLocale).format(totalSubscribers),
    },
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
      {/* KPI strip. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.key}>
            <Icon name={kpi.icon} className={`h-5 w-5 ${KPI_ICON_CLASS}`} />
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
          {canWrite ? <NewPlanDrawer classTypes={classTypes} /> : null}
        </div>
      </div>

      {/* Plan cards, or the segment's empty state. */}
      {shown.length === 0 ? (
        <Card>
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
          {shown.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
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
  canWrite,
  busy,
  onToggle,
  t,
}: {
  plan: AdminSubscriptionPlanRow;
  canWrite: boolean;
  busy: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const isActive = plan.status === 'ACTIVE';
  const tone = toneFor(isActive);
  const features = plan.features;

  return (
    <Card padding="lg" xstyle={isActive ? undefined : cardStyles.archived}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-sm ${TONE_DOT[tone]}`} />
          <h3 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
            {plan.name}
          </h3>
          {plan.popular ? <Badge tone="neutral" icon="star" label={t('popular')} /> : null}
        </div>
        {canWrite ? (
          <ButtonLink
            href={`/payments/${plan.id}`}
            variant="ghost"
            size="inline"
            label={t('edit')}
          />
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

      {/* trial + credits + freeze allowance */}
      {plan.trialDays > 0 || plan.includedCredits > 0 || plan.freezeDaysPerPeriod > 0 ? (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {plan.trialDays > 0 ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-brand-500/10 px-2 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-500/20 dark:text-brand-300">
              <Icon name="spark" className="h-3 w-3" sw={2} />
              {t('trial', { days: plan.trialDays })}
            </span>
          ) : null}
          {plan.includedCredits > 0 ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:text-ink-300 dark:ring-white/10">
              <Icon name="ticket" className="h-3 w-3" sw={2} />
              {t('credits', { count: plan.includedCredits })}
            </span>
          ) : null}
          {plan.freezeDaysPerPeriod > 0 ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-pill px-2 text-[11px] font-semibold text-ink-600 ring-1 ring-inset ring-ink-200 dark:text-ink-300 dark:ring-white/10">
              <Icon name="clock" className="h-3 w-3" sw={2} />
              {t('freeze', { days: plan.freezeDaysPerPeriod })}
            </span>
          ) : null}
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
            {createNumberFormat(defaultLocale).format(plan.subscriberCount)}
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
              // The live/off caption already sits beside the track.
              hideLabel
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
