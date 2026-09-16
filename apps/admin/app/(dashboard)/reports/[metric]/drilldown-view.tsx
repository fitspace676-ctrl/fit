'use client';

// @fit/admin — the client view for one drill-down report (T12.12).
//
// Renders a live {@link ReportDrilldown}: a back link + heading, the shared
// reporting-window control (writes `?range=&from=&to=` so the server component
// re-fetches), the
// headline KPI tiles, and every section via the shared {@link ReportSectionCard}.
// Astryx `Card`/`SegmentedControl` over compiled StyleX + the brand `charts.tsx` —
// no Tailwind, no recharts.

import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import {
  reportQueryParams,
  type ReportDrilldown,
  type ReportMetric,
  type ReportSection,
} from '@fit/types';
import { Icon } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { ReportSectionCard, formatUnitValue } from '../report-sections';
import { ReportRangeControl } from '../report-range-control';
import { BranchScopeNote } from '../branch-scope-note';
import { GYM_WIDE_DRILLDOWNS, gymWideSectionColumnKeys } from '../branch-scope';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
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
  canExport,
  locationId,
}: {
  drilldown: ReportDrilldown;
  /** `ReportExport` — the header's download buttons. */
  canExport: boolean;
  /**
   * The branch the server ran this drill-down for; `undefined` is every branch.
   * It describes THIS render, not whatever the switcher holds now, so the
   * downloads cannot drift from the figures above them.
   */
  locationId: string | undefined;
}) {
  const t = useTranslations('admin.reports');
  const locale = useLocale();

  /**
   * The download URL for this drill-down at the window AND branch on screen. The
   * branch is written in explicitly: the export route would fall back to the
   * cookie, but the cookie can move between this render and the click.
   */
  const exportHref = (format: 'csv' | 'xlsx'): string =>
    adminPath(
      `/reports/${encodeURIComponent(drilldown.metric)}/export?${reportQueryParams({
        ...drilldown,
        locationId,
      }).toString()}&format=${format}`,
    );

  // Whether the whole drill-down is still gym-wide under the selected branch.
  // Silent in "All locations" mode, where it would state the obvious.
  const gymWide = locationId !== undefined && GYM_WIDE_DRILLDOWNS.has(drilldown.metric);

  return (
    <div {...stylex.props(styles.page)}>
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
          <ReportRangeControl range={drilldown.range} from={drilldown.from} to={drilldown.to} />

          {/*
            Plain anchors, not buttons: the browser has to perform the download,
            so the basePath is applied by hand (`adminPath`) rather than by the
            router. The XLSX carries one tab per section; the CSV carries the same
            sections as titled blocks.
          */}
          {canExport ? (
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
          ) : null}
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
            // One column of an otherwise branch-scoped section that cannot narrow
            // (`staff`'s average rating). It rides in the card's action slot, so
            // the shared section renderer needs no branch vocabulary of its own.
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
 * The "not split by branch" note for ONE table section, naming the columns it
 * applies to - or nothing, which is almost every section. The labels come from
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
