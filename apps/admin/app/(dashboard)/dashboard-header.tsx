'use client';

// The dashboard's page header: title, subtitle, and the one date filter that
// governs whatever tab is on screen.
//
// It sits ABOVE the tab bar in the shell rather than inside a tab's content,
// because it used to live inside `OverviewView` — and so vanished on every other
// tab, leaving those tabs untitled and their `?range=` unreachable even though it
// was still deciding what their widgets fetched.
//
// It shows the period filter on EVERY tab. The period decides the window of the
// whole dashboard: the overview is server-rendered from `?period=`, and each
// segment tab (Sales, Members, Revenue, Classes, Staff) is asked for the same
// resolved window, so "this month" is the same days — and the same takings — on
// every tab. A tab's own `granularity` control now picks only its chart bucket.
//
// This file used to carry a `?range=` control for the configurable widget tabs.
// Those tabs are gone. `?range=` itself is NOT: the Overview's `RevenueCard` still
// writes it and the server still reads it for that card's series — it simply has
// no control in the header any more.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createDateTimeFormat } from '@fit/i18n';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
import type { DashboardPeriod, DashboardResolvedPeriod, DashboardSegment } from '@fit/types';

/** The period values offered by the header date filter, in ascending span order. */
const PERIOD_VALUES = [
  'today',
  'week',
  'month',
  'custom',
] as const satisfies readonly DashboardPeriod[];

const styles = stylex.create({
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headerText: {
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
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Which days every figure below covers — the one fact the numbers depend on.
  periodCaption: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    minWidth: 0,
    maxWidth: '100%',
  },
  // On a phone the four presets are wider than the screen; they scroll as one
  // row instead of each label breaking onto two lines.
  presets: {
    maxWidth: '100%',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  presetsInner: {
    width: 'max-content',
  },
});

export function DashboardHeader({
  period,
}: {
  /** The tab on screen. The filter is the same on every tab; kept for callers. */
  active: DashboardSegment;
  period: DashboardResolvedPeriod;
}) {
  const t = useTranslations('admin.dashboard');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** Navigate to the same path with `params` as the new query. */
  function apply(params: URLSearchParams): void {
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  function selectPeriod(next: DashboardPeriod): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', next);
    // Presets carry no explicit dates — drop any stale custom window.
    if (next !== 'custom') {
      params.delete('from');
      params.delete('to');
    }
    apply(params);
  }

  function selectCustomRange(next: DateRange | null): void {
    if (!next) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', 'custom');
    params.set('from', next.start);
    params.set('to', next.end);
    apply(params);
  }

  const locale = useLocale();
  // The console's formatter reads `YYYY-MM-DD` as a UTC-midnight day.
  const day = (iso: string, options: Parameters<typeof createDateTimeFormat>[1]) =>
    createDateTimeFormat(locale, options).format(new Date(`${iso}T00:00:00.000Z`));
  const periodCaption =
    period.from === period.to
      ? day(period.from, { day: 'numeric', month: 'long' })
      : t('period.rangeText', {
          from: day(period.from, { day: '2-digit', month: '2-digit' }),
          to: day(period.to, { day: '2-digit', month: '2-digit' }),
        });

  const periodRange: DateRange = {
    start: period.from as DateRange['start'],
    end: period.to as DateRange['end'],
  };

  return (
    <header {...stylex.props(styles.header)}>
      <div data-reveal {...stylex.props(styles.headerText)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
        <p {...stylex.props(styles.periodCaption)}>{periodCaption}</p>
      </div>
      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.presets)}>
          <div {...stylex.props(styles.presetsInner)}>
            <SegmentedControl
              value={period.period}
              onChange={(next) => selectPeriod(next as DashboardPeriod)}
              label={t('period.aria')}
              size="sm"
              isDisabled={isPending}
            >
              {PERIOD_VALUES.map((value) => (
                <SegmentedControlItem key={value} value={value} label={t(`period.${value}`)} />
              ))}
            </SegmentedControl>
          </div>
        </div>
        {/* The picker only when the operator asked for their own dates; a preset
            already says its window in the caption beside the title. */}
        {period.period === 'custom' ? (
          <DateRangeInput
            label={t('period.rangeLabel')}
            isLabelHidden
            value={periodRange}
            onChange={selectCustomRange}
            hasClear={false}
            size="sm"
            numberOfMonths={1}
            isDisabled={isPending}
          />
        ) : null}
      </div>
    </header>
  );
}
