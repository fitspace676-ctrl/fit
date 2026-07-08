import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import type {
  CrmForecastResponse,
  CrmPipelineResponse,
  LeadStatus,
  OpportunityStatus,
  RecentCrmActivitiesResponse,
} from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon } from '@/components/ui';
import { ACTIVITY_COLORS, ACTIVITY_ICONS, formatDateTime, formatMoney } from './lead-meta';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  // KPI row.
  kpiGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
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
    color: 'var(--color-text-accent)',
  },
  kpiIconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  kpiValue: {
    margin: 0,
    marginTop: '0.75rem',
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
  kpiContext: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  // Two-column area.
  columns: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '3fr 2fr',
    },
    alignItems: 'start',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.25rem',
  },
  cardHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  sectionHint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  mutedText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Pipeline by stage.
  stageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  stageRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  stageHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  stageName: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  stageCount: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  stageValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  stageTrack: {
    position: 'relative',
    height: '0.5rem',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  stageFill: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
  },
  stageFillOpp: {
    backgroundColor: 'var(--color-text-accent)',
  },
  // Revenue forecast chart.
  chart: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.75rem',
    height: '11rem',
    paddingTop: '0.5rem',
  },
  chartCol: {
    display: 'flex',
    flexGrow: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 0,
  },
  chartBars: {
    position: 'relative',
    display: 'flex',
    height: '100%',
    width: '100%',
    maxWidth: '2.75rem',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  chartPotential: {
    position: 'relative',
    width: '100%',
    borderStartStartRadius: 'var(--radius-element)',
    borderStartEndRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    minHeight: '2px',
  },
  chartExpected: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    borderStartStartRadius: 'var(--radius-element)',
    borderStartEndRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
  },
  chartLabel: {
    fontSize: '0.6875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    color: 'var(--color-text-secondary)',
  },
  legendRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  legendSwatch: {
    height: '0.625rem',
    width: '0.625rem',
    borderRadius: '2px',
  },
  legendExpected: {
    backgroundColor: 'var(--color-accent)',
  },
  legendPotential: {
    backgroundColor: 'var(--color-background-muted)',
  },
  chartEmpty: {
    display: 'grid',
    placeItems: 'center',
    height: '11rem',
    textAlign: 'center',
  },
  // Recent activities feed.
  feed: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  feedItem: {
    display: 'flex',
    gap: '0.75rem',
  },
  feedIcon: {
    display: 'grid',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  feedIconSvg: {
    width: '0.875rem',
    height: '0.875rem',
  },
  feedBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  feedHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  feedType: {
    margin: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  feedRegarding: {
    fontSize: '0.75rem',
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  feedNotes: {
    margin: 0,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-primary)',
  },
  feedMeta: {
    margin: 0,
    fontSize: '0.6875rem',
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-secondary)',
  },
  totalsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.875rem',
  },
  totalItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  totalLabel: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'var(--color-text-secondary)',
  },
  totalValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
});

/** Localise a `YYYY-MM` month key to a short "Mon YY" label. */
function monthLabel(monthKey: string, locale: string): string {
  const [year, month] = monthKey.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    year: '2-digit',
  });
}

/** One KPI tile — icon, headline value, label, and sub-context. */
function Kpi({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: 'card' | 'target' | 'award' | 'chart';
}) {
  return (
    <Card variant="default" padding={0} xstyle={styles.kpiCard}>
      <span {...stylex.props(styles.kpiIcon)}>
        <Icon name={icon} {...stylex.props(styles.kpiIconSvg)} />
      </span>
      <p {...stylex.props(styles.kpiValue)}>{value}</p>
      <p {...stylex.props(styles.kpiLabel)}>{label}</p>
      <p {...stylex.props(styles.kpiContext)}>{context}</p>
    </Card>
  );
}

/**
 * The Forecast tab (T12.4): the Open Pipeline summary KPIs, the Pipeline by
 * Stage funnel (per-stage count + value + probability-weighted value across
 * leads and opportunities), the Revenue Forecast chart (expected vs potential
 * revenue by expected-close month) and the Recent Activities feed. All figures
 * come from the tenant-scoped `/crm/pipeline`, `/crm/forecast` and
 * `/crm/activities/recent` aggregation endpoints.
 */
export async function ForecastView({
  pipeline,
  forecast,
  recent,
}: {
  pipeline: CrmPipelineResponse;
  forecast: CrmForecastResponse;
  recent: RecentCrmActivitiesResponse;
}) {
  const t = await getTranslations('admin.crm');
  const locale = await getLocale();

  const { totals, stages } = pipeline;
  const maxStageValue = Math.max(1, ...stages.map((stage) => stage.value));
  const maxMonth = Math.max(1, ...forecast.months.map((month) => month.potential));

  return (
    <div {...stylex.props(styles.stack)}>
      {/* Open Pipeline summary. */}
      <div {...stylex.props(styles.kpiGrid)}>
        <Kpi
          label={t('forecast.pipelineValue')}
          value={formatMoney(totals.pipelineValue)}
          context={t('forecast.openDealsContext', {
            leads: totals.openLeads,
            opportunities: totals.openOpportunities,
          })}
          icon="card"
        />
        <Kpi
          label={t('forecast.weightedValue')}
          value={formatMoney(totals.weightedValue)}
          context={t('forecast.weightedContext')}
          icon="target"
        />
        <Kpi
          label={t('forecast.winRate')}
          value={`${totals.winRate}%`}
          context={t('forecast.winRateContext')}
          icon="award"
        />
        <Kpi
          label={t('forecast.expectedTotal')}
          value={formatMoney(forecast.totals.expected)}
          context={t('forecast.expectedTotalContext', { deals: forecast.totals.deals })}
          icon="chart"
        />
      </div>

      <div {...stylex.props(styles.columns)}>
        <div {...stylex.props(styles.stack)}>
          {/* Pipeline by stage. */}
          <Card variant="default" padding={0} xstyle={styles.card}>
            <div {...stylex.props(styles.cardHead)}>
              <h3 {...stylex.props(styles.sectionLabel)}>{t('forecast.pipelineByStage')}</h3>
              <p {...stylex.props(styles.sectionHint)}>{t('forecast.pipelineByStageHint')}</p>
            </div>
            {stages.every((stage) => stage.count === 0) ? (
              <p {...stylex.props(styles.mutedText)}>{t('forecast.pipelineEmpty')}</p>
            ) : (
              <div {...stylex.props(styles.stageList)}>
                {stages.map((stage) => {
                  const label =
                    stage.kind === 'LEAD'
                      ? t(`status.${stage.stage as LeadStatus}`)
                      : t(`opportunityStatus.${stage.stage as OpportunityStatus}`);
                  return (
                    <div key={`${stage.kind}-${stage.stage}`} {...stylex.props(styles.stageRow)}>
                      <div {...stylex.props(styles.stageHead)}>
                        <span {...stylex.props(styles.stageName)}>
                          {label}
                          <Badge tone={stage.kind === 'LEAD' ? 'ink' : 'brand'}>
                            {stage.kind === 'LEAD'
                              ? t('forecast.kindLead')
                              : t('forecast.kindOpportunity')}
                          </Badge>
                          <span {...stylex.props(styles.stageCount)}>
                            {t('forecast.stageItems', { count: stage.count })}
                          </span>
                        </span>
                        <span {...stylex.props(styles.stageValue)}>{formatMoney(stage.value)}</span>
                      </div>
                      <span {...stylex.props(styles.stageTrack)}>
                        <span
                          {...stylex.props(
                            styles.stageFill,
                            stage.kind === 'OPPORTUNITY' && styles.stageFillOpp,
                          )}
                          style={{ width: `${Math.round((stage.value / maxStageValue) * 100)}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Revenue forecast. */}
          <Card variant="default" padding={0} xstyle={styles.card}>
            <div {...stylex.props(styles.cardHead)}>
              <h3 {...stylex.props(styles.sectionLabel)}>{t('forecast.revenueForecast')}</h3>
              <p {...stylex.props(styles.sectionHint)}>{t('forecast.revenueForecastHint')}</p>
            </div>
            {forecast.months.length === 0 ? (
              <div {...stylex.props(styles.chartEmpty)}>
                <p {...stylex.props(styles.mutedText)}>{t('forecast.revenueEmpty')}</p>
              </div>
            ) : (
              <>
                <div
                  {...stylex.props(styles.chart)}
                  role="img"
                  aria-label={t('forecast.revenueForecast')}
                >
                  {forecast.months.map((month) => (
                    <div key={month.month} {...stylex.props(styles.chartCol)}>
                      <div {...stylex.props(styles.chartBars)}>
                        <div
                          {...stylex.props(styles.chartPotential)}
                          style={{
                            height: `${Math.max(2, Math.round((month.potential / maxMonth) * 100))}%`,
                          }}
                          title={t('forecast.barTitle', {
                            month: monthLabel(month.month, locale),
                            expected: formatMoney(month.expected),
                            potential: formatMoney(month.potential),
                          })}
                        >
                          <div
                            {...stylex.props(styles.chartExpected)}
                            style={{
                              height: `${
                                month.potential > 0
                                  ? Math.round((month.expected / month.potential) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                      <span {...stylex.props(styles.chartLabel)}>
                        {monthLabel(month.month, locale)}
                      </span>
                    </div>
                  ))}
                </div>
                <div {...stylex.props(styles.legendRow)}>
                  <span {...stylex.props(styles.legendItem)}>
                    <span {...stylex.props(styles.legendSwatch, styles.legendExpected)} />
                    {t('forecast.legendExpected')}
                  </span>
                  <span {...stylex.props(styles.legendItem)}>
                    <span {...stylex.props(styles.legendSwatch, styles.legendPotential)} />
                    {t('forecast.legendPotential')}
                  </span>
                </div>
              </>
            )}
            <div {...stylex.props(styles.totalsRow)}>
              <span {...stylex.props(styles.totalItem)}>
                <span {...stylex.props(styles.totalLabel)}>{t('forecast.legendExpected')}</span>
                <span {...stylex.props(styles.totalValue)}>
                  {formatMoney(forecast.totals.expected)}
                </span>
              </span>
              <span {...stylex.props(styles.totalItem)}>
                <span {...stylex.props(styles.totalLabel)}>{t('forecast.legendPotential')}</span>
                <span {...stylex.props(styles.totalValue)}>
                  {formatMoney(forecast.totals.potential)}
                </span>
              </span>
              <span {...stylex.props(styles.totalItem)}>
                <span {...stylex.props(styles.totalLabel)}>{t('forecast.unscheduled')}</span>
                <span {...stylex.props(styles.totalValue)}>
                  {t('forecast.unscheduledValue', {
                    deals: forecast.unscheduled.deals,
                    amount: formatMoney(forecast.unscheduled.potential),
                  })}
                </span>
              </span>
            </div>
          </Card>
        </div>

        {/* Recent activities feed. */}
        <Card variant="default" padding={0} xstyle={styles.card}>
          <div {...stylex.props(styles.cardHead)}>
            <h3 {...stylex.props(styles.sectionLabel)}>{t('forecast.recentActivities')}</h3>
            <p {...stylex.props(styles.sectionHint)}>{t('forecast.recentActivitiesHint')}</p>
          </div>
          {recent.data.length === 0 ? (
            <p {...stylex.props(styles.mutedText)}>{t('forecast.recentEmpty')}</p>
          ) : (
            <ul {...stylex.props(styles.feed)}>
              {recent.data.map((activity) => {
                const href =
                  activity.regarding?.kind === 'OPPORTUNITY'
                    ? `/crm/opportunities/${activity.regarding.id}`
                    : activity.regarding?.kind === 'LEAD'
                      ? `/crm/leads/${activity.regarding.id}`
                      : null;
                return (
                  <li key={activity.id} {...stylex.props(styles.feedItem)}>
                    <span
                      {...stylex.props(styles.feedIcon)}
                      style={{ color: ACTIVITY_COLORS[activity.type] }}
                    >
                      <Icon
                        name={ACTIVITY_ICONS[activity.type]}
                        {...stylex.props(styles.feedIconSvg)}
                      />
                    </span>
                    <div {...stylex.props(styles.feedBody)}>
                      <div {...stylex.props(styles.feedHead)}>
                        <p {...stylex.props(styles.feedType)}>
                          {t(`activityType.${activity.type}`)}
                        </p>
                        {activity.regarding && href ? (
                          <Link href={href} {...stylex.props(styles.feedRegarding)}>
                            {activity.regarding.name}
                          </Link>
                        ) : null}
                      </div>
                      {activity.notes ? (
                        <p {...stylex.props(styles.feedNotes)}>{activity.notes}</p>
                      ) : null}
                      <p {...stylex.props(styles.feedMeta)}>
                        {activity.staffName} · {formatDateTime(activity.occurredAt, locale)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
