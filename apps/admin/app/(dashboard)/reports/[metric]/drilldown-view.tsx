'use client';

// @fit/admin — the client view for one drill-down report (T12.12).
//
// Renders a live {@link ReportDrilldown}: a back link + heading, a date-range
// segmented control (writes `?range=` so the server component re-fetches), the
// headline KPI tiles, and every section via the shared {@link ReportSectionCard}.
// Astryx `Card`/`SegmentedControl` over compiled StyleX + the brand `charts.tsx` —
// no Tailwind, no recharts.

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { ReportDrilldown, ReportRange } from '@fit/types';
import { Icon } from '@/components/ui';
import { ReportSectionCard, formatUnitValue } from '../report-sections';

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: ReportRange; labelKey: string }> = [
  { value: '7d', labelKey: 'range7d' },
  { value: '30d', labelKey: 'range30d' },
  { value: '12w', labelKey: 'range12w' },
  { value: '12m', labelKey: 'range12m' },
];

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  pending: {
    opacity: 0.6,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
  },
  back: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  rangeControl: {
    alignSelf: 'flex-start',
  },
  kpiRow: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 900px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  kpiCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    padding: '1.25rem',
  },
  kpiLabel: {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-text-secondary)',
  },
  kpiValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
});

export function DrilldownView({ drilldown }: { drilldown: ReportDrilldown }) {
  const t = useTranslations('admin.reports');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigate] = useTransition();

  function selectRange(next: ReportRange): void {
    if (next === drilldown.range) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    startNavigate(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  const busy = isNavigating;

  return (
    <div {...stylex.props(styles.page, busy && styles.pending)}>
      <Link href="/reports" {...stylex.props(styles.back)}>
        <Icon name="arrowLeft" {...stylex.props(styles.backIcon)} sw={2} />
        {t('drilldown.back')}
      </Link>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headCopy)}>
          <h1 {...stylex.props(styles.title)}>{drilldown.name}</h1>
          <p {...stylex.props(styles.description)}>{drilldown.description}</p>
        </div>
        <SegmentedControl
          value={drilldown.range}
          onChange={(next) => selectRange(next as ReportRange)}
          label={t('reportingRange')}
          size="sm"
          isDisabled={busy}
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
      </header>

      {drilldown.kpis.length > 0 && (
        <div {...stylex.props(styles.kpiRow)}>
          {drilldown.kpis.map((kpi) => (
            <Card key={kpi.id} variant="default" padding={0} xstyle={styles.kpiCard}>
              <span {...stylex.props(styles.kpiLabel)}>{kpi.label}</span>
              <span {...stylex.props(styles.kpiValue)}>
                {formatUnitValue(kpi.unit, kpi.value, drilldown.currency, locale)}
              </span>
            </Card>
          ))}
        </div>
      )}

      <div {...stylex.props(styles.sections)}>
        {drilldown.sections.map((section) => (
          <ReportSectionCard
            key={section.id}
            section={section}
            currency={drilldown.currency}
            locale={locale}
            emptyLabel={t('drilldown.emptySection')}
          />
        ))}
      </div>
    </div>
  );
}
