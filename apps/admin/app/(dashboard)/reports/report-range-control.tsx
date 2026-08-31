'use client';

// @fit/admin — the reporting-window control the Reports hub and every drill-down
// share: four presets (today, the last 7 days, the month so far, custom) beside a
// date-range field that always shows the days the current window RESOLVED to.
//
// It writes to the URL rather than to state, exactly like the dashboard header's
// period filter: the server component re-fetches from `?range=&from=&to=`, so the
// URL is the source of truth and a link carries the window with it.
//
// The two date fields are not gated behind the Custom segment. They read the
// window the API echoed back — `7d` shows the seven days it was — so the reader
// sees which days a preset actually covered, and picking a day in either IS how
// a custom range is chosen; the segment follows.
//
// They are the kit's `DateField`, not Astryx's `DateRangeInput`: the kit field
// takes the interface locale for its month and weekday names, where Astryx reads
// the browser's (`Intl.DateTimeFormat(undefined, …)`), so a Georgian console
// showed an English calendar with no prop to correct it.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateField } from '@fit/ui-kit';
import { reportRangeSchema, type ReportRange } from '@fit/types';

/** The presets, in the order the control shows them — the shared schema's own order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: ReportRange; labelKey: string }> = [
  { value: 'today', labelKey: 'rangeToday' },
  { value: '7d', labelKey: 'range7d' },
  { value: 'mtd', labelKey: 'rangeMtd' },
  { value: 'custom', labelKey: 'rangeCustom' },
];

// Every schema value has a segment, and only those: a preset added to the type
// without a label here fails to compile rather than quietly missing from the UI.
const _exhaustive: Record<ReportRange, true> = Object.fromEntries(
  reportRangeSchema.options.map((value) => [value, true]),
) as Record<ReportRange, true>;
void _exhaustive;

const styles = stylex.create({
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  days: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  day: {
    width: '9.5rem',
  },
});

/** Today as `YYYY-MM-DD` in the browser's zone — the date field's upper bound. */
function browserToday(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ReportRangeControl({
  range,
  from,
  to,
  isDisabled = false,
}: {
  range: ReportRange;
  /** The first and last day the current window resolved to (`YYYY-MM-DD`). */
  from: string;
  to: string;
  isDisabled?: boolean;
}) {
  const t = useTranslations('admin.reports');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** Navigate to the same path with `params` as the new query, keeping scroll. */
  function apply(params: URLSearchParams): void {
    const query = params.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  }

  function selectPreset(next: ReportRange): void {
    if (next === range) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', next);
    if (next === 'custom') {
      // "Custom" with no days yet is the window already on screen, made explicit
      // — the reader then adjusts it in the date field rather than facing a 400.
      params.set('from', from);
      params.set('to', to);
    } else {
      // A preset carries no explicit days; leaving stale ones in the URL would
      // be dropped by the API anyway, and they would mislead anyone reading it.
      params.delete('from');
      params.delete('to');
    }
    apply(params);
  }

  /** One end of the window moved: the other stays, and the pair becomes a custom range. */
  function selectDays(nextFrom: string, nextTo: string): void {
    if (!nextFrom || !nextTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    // A start dragged past the end (or the reverse) collapses to one day
    // rather than reaching the API as a window it would refuse.
    params.set('from', nextFrom > nextTo ? nextTo : nextFrom);
    params.set('to', nextTo < nextFrom ? nextFrom : nextTo);
    apply(params);
  }

  const busy = isDisabled || isPending;
  const today = browserToday();
  const calendar = {
    open: t('calendar.open'),
    previousMonth: t('calendar.previousMonth'),
    nextMonth: t('calendar.nextMonth'),
    chooseYear: t('calendar.chooseYear'),
  };

  return (
    <div {...stylex.props(styles.controls)}>
      <SegmentedControl
        value={range}
        onChange={(next) => selectPreset(next as ReportRange)}
        label={t('reportingRange')}
        size="sm"
        isDisabled={busy}
      >
        {RANGE_OPTIONS.map((option) => (
          <SegmentedControlItem
            key={option.value}
            value={option.value}
            label={t(option.labelKey)}
          />
        ))}
      </SegmentedControl>
      {/* The API refuses a window ending after today; the calendars say so
          rather than the round trip. */}
      <div {...stylex.props(styles.days)}>
        <DateField
          label={t('rangeFrom')}
          value={from}
          onChange={(next) => selectDays(next, to)}
          locale={locale}
          labels={calendar}
          max={today}
          disabled={busy}
          xstyle={styles.day}
        />
        <DateField
          label={t('rangeTo')}
          value={to}
          onChange={(next) => selectDays(from, next)}
          locale={locale}
          labels={calendar}
          max={today}
          disabled={busy}
          xstyle={styles.day}
        />
      </div>
    </div>
  );
}
