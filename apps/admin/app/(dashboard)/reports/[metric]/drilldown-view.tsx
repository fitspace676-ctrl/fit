'use client';

// @fit/admin — the client view for one drill-down report (T12.12).
//
// Renders a live {@link ReportDrilldown}: a back link + heading, a date-range
// segmented control (writes `?range=` so the server component re-fetches), the
// headline KPI tiles, and every section via the shared {@link ReportSectionCard}.
// Astryx `Card`/`SegmentedControl` over compiled StyleX + the brand `charts.tsx` —
// no Tailwind, no recharts.

import { useTransition } from 'react';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { ReportDrilldown, ReportMetric, ReportRange, ReportSection } from '@fit/types';
import { Icon } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { ReportSectionCard, formatUnitValue } from '../report-sections';
import { BranchScopeNote } from '../branch-scope-note';
import { GYM_WIDE_DRILLDOWNS, gymWideSectionColumnKeys } from '../branch-scope';

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
  // The range picker and the downloads share the header's right-hand side, so a
  // narrow viewport wraps them as one block rather than stranding the buttons.
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  rangeControl: {
    alignSelf: 'flex-start',
  },
  downloads: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
  },
  iconSm: {
    width: '1rem',
    height: '1rem',
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

export function DrilldownView({
  drilldown,
  locationId,
}: {
  drilldown: ReportDrilldown;
  /**
   * The branch the server ran this drill-down for; `undefined` is every branch.
   * Same contract as the catalogue view's prop — it describes THIS render, not
   * whatever the switcher currently holds, so the downloads cannot drift from the
   * figures above them.
   */
  locationId: string | undefined;
}) {
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

  /**
   * The download URL for this drill-down at the range AND branch currently on
   * screen. The branch is written in explicitly — the export route would fall back
   * to the cookie, but the cookie can move between this render and the click, and
   * a file that quietly covers a different branch than the page it came from is
   * the failure this whole wiring exists to avoid.
   */
  const exportHref = (format: 'csv' | 'xlsx'): string => {
    const params = new URLSearchParams({ range: drilldown.range, format });
    if (locationId) {
      params.set('locationId', locationId);
    }
    return adminPath(
      `/reports/${encodeURIComponent(drilldown.metric)}/export?${params.toString()}`,
    );
  };

  // Whether this whole drill-down is still gym-wide under the selected branch.
  // Silent in "All locations" mode, where it would state the obvious.
  const gymWide = locationId !== undefined && GYM_WIDE_DRILLDOWNS.has(drilldown.metric);

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
          {/* Above the KPI tiles, because it is true of every one of them. */}
          {gymWide ? <BranchScopeNote /> : null}
        </div>
        <div {...stylex.props(styles.controls)}>
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

          {/*
            Plain anchors, not buttons: the browser has to perform the download,
            so the basePath is applied by hand (`adminPath`) rather than by the
            router. The XLSX carries one tab per section; the CSV carries the same
            sections as titled blocks.
          */}
          <div {...stylex.props(styles.downloads)}>
            <Button
              label={t('downloadCsv')}
              variant="secondary"
              size="sm"
              href={exportHref('csv')}
              icon={<Icon name="download" {...stylex.props(styles.iconSm)} />}
            />
            <Button
              label={t('downloadXlsx')}
              variant="secondary"
              size="sm"
              href={exportHref('xlsx')}
              icon={<Icon name="download" {...stylex.props(styles.iconSm)} />}
            />
          </div>
        </div>
      </header>

      {drilldown.kpis.length > 0 && (
        <div {...stylex.props(styles.kpiRow)}>
          {drilldown.kpis.map((kpi) => (
            <Card key={kpi.id} padding="none" xstyle={styles.kpiCard}>
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
            // A section whose delivery figures narrow but one of whose columns
            // cannot — `staff`'s average rating, which is a property of the trainer
            // rather than of the branch. The caveat rides in the card's own header
            // action slot, so the shared section renderer (which the dashboard's
            // segment widgets also use) needs no branch vocabulary of its own.
            action={
              locationId === undefined || gymWide ? undefined : (
                <SectionScopeNote metric={drilldown.metric} section={section} />
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The "not split by branch" note for ONE section of an otherwise branch-scoped
 * drill-down, naming the columns it applies to — or nothing at all when the
 * section narrows cleanly, which is the overwhelming majority of them.
 *
 * Only `table` sections can carry the caveat: a chart section is one series with
 * one scope, so if it did not narrow the whole drill-down would be on the gym-wide
 * list and the header note would already have said so. The column labels come from
 * the API's own section definition, so the note points at headers the reader can
 * see in the table beneath it.
 */
function SectionScopeNote({ metric, section }: { metric: ReportMetric; section: ReportSection }) {
  const keys = gymWideSectionColumnKeys(metric, section.id);
  if (keys.length === 0 || section.kind !== 'table') {
    return null;
  }
  const labels = section.columns
    .filter((column) => keys.includes(column.key))
    .map((column) => column.label);
  return labels.length > 0 ? <BranchScopeNote columns={labels} /> : null;
}
