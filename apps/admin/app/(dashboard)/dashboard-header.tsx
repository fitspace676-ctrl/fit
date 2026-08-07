'use client';

// The dashboard's page header: title, subtitle, and the one date filter that
// governs whatever tab is on screen.
//
// It sits ABOVE the tab bar in the shell rather than inside a tab's content,
// because it used to live inside `OverviewView` — and so vanished on every other
// tab, leaving those tabs untitled and their `?range=` unreachable even though it
// was still deciding what their widgets fetched.
//
// It shows the period filter on OVERVIEW and nothing anywhere else.
//
// That asymmetry is deliberate. Overview is server-rendered from `?period=`, so
// its filter belongs in the chrome. Every other tab is a hand-built view owning a
// `granularity` control that picks its window and its bucket together, next to the
// chart it redraws — a second time filter up here would be a dead one.
//
// This file used to carry a `?range=` control for the configurable widget tabs.
// Those tabs are gone. `?range=` itself is NOT: the Overview's `RevenueCard` still
// writes it and the server still reads it for that card's series — it simply has
// no control in the header any more.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
});

export function DashboardHeader({
  active,
  period,
}: {
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

  const periodRange: DateRange = {
    start: period.from as DateRange['start'],
    end: period.to as DateRange['end'],
  };

  return (
    <header {...stylex.props(styles.header)}>
      <div {...stylex.props(styles.headerText)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
      </div>
      <div {...stylex.props(styles.controls)}>
        {active === 'overview' ? (
          <>
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
          </>
        ) : null}
      </div>
    </header>
  );
}
