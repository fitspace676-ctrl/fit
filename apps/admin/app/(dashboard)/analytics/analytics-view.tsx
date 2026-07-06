'use client';

// @fit/admin — the Analytics screen's client view, rebuilt on Astryx (T11.18).
//
// Renders the real {@link AdminAnalyticsResponse} as a range control, four KPI
// cards, a revenue area chart, a channel-mix donut, a plan-mix bar list, and a
// top-classes list — every section degrades to an explicit empty state when its
// series is empty, never inventing a value. The range control writes `?range=` to
// the URL so the server component re-fetches (the data source of truth stays
// server-side).
//
// Presentation is Astryx `Card` / `Badge` / `SegmentedControl` over the Fit brand
// theme tokens, with all layout and the data-viz bits authored in compiled StyleX
// (`var(--color-*)` / `var(--font-family-*)`) — no Tailwind utilities and no
// FormaCore Aurora-glass primitives.

import { useMemo, useTransition, useId, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type {
  AdminAnalyticsResponse,
  AnalyticsChannelSlice,
  AnalyticsKpi,
  AnalyticsRange,
} from '@fit/types';
import { CountUp, Icon, type IconName } from '@/components/ui';
import { AreaChart, type AreaPoint } from '../charts';

type T = ReturnType<typeof useTranslations>;

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: AnalyticsRange; labelKey: string }> = [
  { value: '7d', labelKey: 'range7d' },
  { value: '30d', labelKey: 'range30d' },
  { value: '12w', labelKey: 'range12w' },
  { value: '12m', labelKey: 'range12m' },
];

const CHANNEL_LABEL_KEYS: Record<AnalyticsChannelSlice['channel'], string> = {
  POS: 'channelPos',
  ONLINE: 'channelOnline',
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  kpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  gridThirds: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  gridHalves: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(2, minmax(0, 1fr))',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
    gridColumn: {
      default: 'auto',
      '@media (min-width: 1024px)': 'span 2',
    },
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  cardHeadPlain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  labelSpaced: {
    marginBottom: '1rem',
  },
  metaText: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.5rem',
    width: '2.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '1rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.875rem',
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
  deltaMuted: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  channelWrap: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: 'center',
    gap: '1.25rem',
  },
  donutBox: {
    position: 'relative',
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
  },
  donutSvg: {
    transform: 'rotate(-90deg)',
  },
  donutTrack: {
    color: 'var(--color-background-muted)',
  },
  donutCenter: {
    position: 'absolute',
    insetInline: 0,
    insetBlock: 0,
    display: 'grid',
    placeItems: 'center',
    textAlign: 'center',
  },
  donutTotal: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  legend: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    flex: 1,
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.875rem',
  },
  legendName: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--color-text-secondary)',
  },
  swatch: {
    display: 'inline-block',
    height: '0.625rem',
    width: '0.625rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
  },
  channelPos: { color: 'var(--color-accent)' },
  channelOnline: { color: 'var(--color-text-teal)' },
  legendValue: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  planList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  planHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
    fontSize: '0.875rem',
  },
  planName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  planCount: {
    marginLeft: '0.75rem',
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  planTrack: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  planFill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
  },
  rankList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  rankRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
  },
  rankLeft: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '0.75rem',
  },
  rankBadge: {
    display: 'grid',
    height: '1.5rem',
    width: '1.5rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  rankTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  rankCount: {
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    display: 'grid',
    minHeight: '6rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rangeControl: {
    alignSelf: 'flex-start',
  },
});

/** StyleX colour per channel slice, brand-first. */
const CHANNEL_STYLE: Record<AnalyticsChannelSlice['channel'], keyof typeof styles> = {
  POS: 'channelPos',
  ONLINE: 'channelOnline',
};

export function AnalyticsView({ data }: { data: AdminAnalyticsResponse }) {
  const t = useTranslations('admin.analytics');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectRange(next: AnalyticsRange): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency, locale],
  );

  const revenuePoints: AreaPoint[] = data.revenueSeries.map((p) => ({
    label: p.date,
    // Money is carried in MINOR units; the chart plots major units.
    value: p.value / 100,
  }));

  return (
    <div {...stylex.props(styles.page, isPending && styles.pending)}>
      <SegmentedControl
        value={data.range}
        onChange={(next) => selectRange(next as AnalyticsRange)}
        label={t('reportingRange')}
        size="sm"
        isDisabled={isPending}
        xstyle={styles.rangeControl}
      >
        {RANGE_OPTIONS.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            label={t(option.labelKey)}
          />
        ))}
      </SegmentedControl>

      {/* KPI cards */}
      <section aria-label={t('keyMetrics')} {...stylex.props(styles.kpiGrid)}>
        <KpiCard
          label={t('revenue')}
          icon="card"
          kpi={data.kpis.revenue}
          format={(v) => money.format(v / 100)}
          t={t}
        />
        <KpiCard label={t('activeMembers')} icon="users" kpi={data.kpis.activeMembers} t={t} />
        <KpiCard
          label={t('attendanceRate')}
          icon="check"
          kpi={data.kpis.attendanceRate}
          suffix="%"
          t={t}
        />
        <KpiCard
          label={t('churn')}
          icon="logout"
          kpi={data.kpis.churn}
          suffix="%"
          invertDelta
          t={t}
        />
      </section>

      {/* Revenue + channel mix */}
      <section {...stylex.props(styles.gridThirds)}>
        <Card variant="default" padding={0} xstyle={styles.cardWide}>
          <div {...stylex.props(styles.cardHead)}>
            <h2 {...stylex.props(styles.sectionLabel)}>{t('revenue')}</h2>
            <span {...stylex.props(styles.metaText)}>{t('capturedPayments')}</span>
          </div>
          {revenuePoints.some((p) => p.value > 0) ? (
            <AreaChart data={revenuePoints} ariaLabel={t('revenueChartLabel')} />
          ) : (
            <EmptyState>{t('emptyRevenue')}</EmptyState>
          )}
        </Card>

        <Card variant="default" padding={0} xstyle={styles.card}>
          <h2 {...stylex.props(styles.sectionLabel, styles.labelSpaced)}>{t('channelMix')}</h2>
          <ChannelMix slices={data.channelMix} format={(v) => money.format(v / 100)} t={t} />
        </Card>
      </section>

      {/* Plan mix + top classes */}
      <section {...stylex.props(styles.gridHalves)}>
        <Card variant="default" padding={0} xstyle={styles.card}>
          <h2 {...stylex.props(styles.sectionLabel, styles.labelSpaced)}>
            {t('subscribersByPlan')}
          </h2>
          <PlanMix data={data} t={t} />
        </Card>

        <Card variant="default" padding={0} xstyle={styles.card}>
          <h2 {...stylex.props(styles.sectionLabel, styles.labelSpaced)}>{t('topClasses')}</h2>
          <TopClasses data={data} t={t} />
        </Card>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI card                                                                   */
/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  icon,
  kpi,
  suffix = '',
  format,
  invertDelta = false,
  t,
}: {
  label: string;
  icon: IconName;
  kpi: AnalyticsKpi;
  suffix?: string;
  format?: (value: number) => string;
  /** For metrics where down is good (churn): a negative delta reads as positive. */
  invertDelta?: boolean;
  t: T;
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.cardHeadPlain)}>
        <span {...stylex.props(styles.iconTile)}>
          <Icon name={icon} {...stylex.props(styles.icon)} />
        </span>
        <DeltaChip deltaPct={kpi.deltaPct} invert={invertDelta} t={t} />
      </div>
      <p {...stylex.props(styles.kpiValue)}>
        {format ? (
          format(kpi.value)
        ) : (
          <>
            <CountUp to={Math.round(kpi.value)} />
            {suffix}
          </>
        )}
      </p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
    </Card>
  );
}

function DeltaChip({ deltaPct, invert, t }: { deltaPct: number | null; invert: boolean; t: T }) {
  if (deltaPct === null) {
    return <span {...stylex.props(styles.deltaMuted)}>{t('noPriorData')}</span>;
  }
  const isGood = invert ? deltaPct <= 0 : deltaPct >= 0;
  const arrow = deltaPct >= 0 ? '▲' : '▼';
  return <Badge variant={isGood ? 'success' : 'error'} label={`${arrow} ${Math.abs(deltaPct)}%`} />;
}

/* -------------------------------------------------------------------------- */
/*  Channel mix (multi-segment donut)                                          */
/* -------------------------------------------------------------------------- */

function ChannelMix({
  slices,
  format,
  t,
}: {
  slices: AnalyticsChannelSlice[];
  format: (amount: number) => string;
  t: T;
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  if (total <= 0) {
    return <EmptyState>{t('emptyChannelMix')}</EmptyState>;
  }

  const size = 120;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div {...stylex.props(styles.channelWrap)}>
      <div {...stylex.props(styles.donutBox)} style={{ width: size, height: size }}>
        <svg width={size} height={size} {...stylex.props(styles.donutSvg)}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            {...stylex.props(styles.donutTrack)}
            stroke="currentColor"
          />
          {slices.map((slice) => {
            const frac = slice.amount / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={`${rawId}-${slice.channel}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="butt"
                {...stylex.props(styles[CHANNEL_STYLE[slice.channel]])}
                stroke="currentColor"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div {...stylex.props(styles.donutCenter)}>
          <span {...stylex.props(styles.donutTotal)}>{format(total)}</span>
        </div>
      </div>

      <ul {...stylex.props(styles.legend)}>
        {slices.map((slice) => (
          <li key={slice.channel} {...stylex.props(styles.legendRow)}>
            <span {...stylex.props(styles.legendName)}>
              <span {...stylex.props(styles.swatch, styles[CHANNEL_STYLE[slice.channel]])} />
              {t(CHANNEL_LABEL_KEYS[slice.channel])}
            </span>
            <span {...stylex.props(styles.legendValue)}>{format(slice.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plan mix (bar list)                                                        */
/* -------------------------------------------------------------------------- */

function PlanMix({ data, t }: { data: AdminAnalyticsResponse; t: T }) {
  const { planMix } = data;
  if (planMix.length === 0) {
    return <EmptyState>{t('emptyPlanMix')}</EmptyState>;
  }
  const max = Math.max(1, ...planMix.map((p) => p.subscribers));

  return (
    <ul {...stylex.props(styles.planList)}>
      {planMix.map((plan) => (
        <li key={plan.planId ?? plan.name}>
          <div {...stylex.props(styles.planHead)}>
            <span {...stylex.props(styles.planName)}>{plan.name}</span>
            <span {...stylex.props(styles.planCount)}>{plan.subscribers}</span>
          </div>
          <div {...stylex.props(styles.planTrack)}>
            <div
              {...stylex.props(styles.planFill)}
              style={{ width: `${(plan.subscribers / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Top classes                                                                */
/* -------------------------------------------------------------------------- */

function TopClasses({ data, t }: { data: AdminAnalyticsResponse; t: T }) {
  const { topClasses } = data;
  if (topClasses.length === 0) {
    return <EmptyState>{t('emptyTopClasses')}</EmptyState>;
  }
  return (
    <ol {...stylex.props(styles.rankList)}>
      {topClasses.map((row, i) => (
        <li key={row.templateId} {...stylex.props(styles.rankRow)}>
          <span {...stylex.props(styles.rankLeft)}>
            <span {...stylex.props(styles.rankBadge)}>{i + 1}</span>
            <span {...stylex.props(styles.rankTitle)}>{row.title}</span>
          </span>
          <span {...stylex.props(styles.rankCount)}>
            {t('bookingsCount', { count: row.bookings })}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.empty)}>{children}</div>;
}
