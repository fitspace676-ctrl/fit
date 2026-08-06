'use client';

// The widget grid for one segment.
//
// Widget bodies are the EXISTING `ReportSectionCard`, so a series or heatmap
// looks the same on the dashboard as it does in Reports and there is no second
// renderer to keep in step.
//
// Motion: each card fades and rises on entry, staggered by its index, so a
// segment resolves as a short cascade rather than a single hard swap. The
// stagger is capped so a long segment never feels slow. Only `opacity` and
// `transform` animate — both compositor properties. Under
// `prefers-reduced-motion` the rise and the stagger drop away, leaving a plain
// fade: the motion is decoration and never gates the content.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { ResolvedDashboardWidget } from '@fit/types';
import { ReportSectionCard } from '../reports/report-sections';

/** Per-card entry delay, and the ceiling the cascade is clamped to. */
const STAGGER_MS = 40;
const MAX_STAGGER_MS = 240;

const fadeUp = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const fadeOnly = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (max-width: 60rem)': '1fr',
    },
    gap: '1.5rem',
  },
  sm: { gridColumn: 'span 1' },
  md: { gridColumn: { default: 'span 1', '@media (max-width: 60rem)': 'span 1' } },
  lg: { gridColumn: { default: 'span 2', '@media (max-width: 60rem)': 'span 1' } },
  empty: {
    margin: 0,
    paddingBlock: '3rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

const motion = stylex.create({
  enter: (delayMs: number) => ({
    animationName: {
      default: fadeUp,
      '@media (prefers-reduced-motion: reduce)': fadeOnly,
    },
    animationDuration: '0.22s',
    animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
    animationDelay: {
      default: `${delayMs}ms`,
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    animationFillMode: 'both',
  }),
});

export function WidgetGrid({
  widgets,
  currency,
  locale,
}: {
  widgets: ResolvedDashboardWidget[];
  currency: string;
  locale: string;
}) {
  const t = useTranslations('admin.dashboard.segments');
  // `emptySection` — the same "no data in this range" copy `drilldown-view.tsx`
  // passes `ReportSectionCard`, so a widget with no data reads identically here.
  const tReports = useTranslations('admin.reports.drilldown');

  if (widgets.length === 0) {
    return <p {...stylex.props(styles.empty)}>{t('empty')}</p>;
  }

  return (
    <div {...stylex.props(styles.grid)}>
      {widgets.map((widget, index) => (
        <div
          key={widget.key}
          {...stylex.props(
            styles[widget.size],
            motion.enter(Math.min(index * STAGGER_MS, MAX_STAGGER_MS)),
          )}
        >
          <ReportSectionCard
            section={widget.section}
            currency={currency}
            locale={locale}
            emptyLabel={tReports('emptySection')}
          />
        </div>
      ))}
    </div>
  );
}
