'use client';

// @fit/admin — the reporting-window control the Reports hub and every drill-down
// share: four presets (today, the last 7 days, the month so far, custom) beside a
// date-range field that always shows the days the current window RESOLVED to.
//
// It writes to the URL rather than to state, exactly like the dashboard header's
// period filter: the server component re-fetches from `?range=&from=&to=`, so the
// URL is the source of truth and a link carries the window with it.
//
// The date field is not gated behind the Custom segment. It reads the window the
// API echoed back — `7d` shows the seven days it was — so the reader sees which
// days a preset actually covered, and picking two days in it IS how a custom
// range is chosen; the segment follows.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { DateRangeInput, type DateRange } from '@astryxdesign/core/DateRangeInput';
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

  function selectCustomRange(next: DateRange | null): void {
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    params.set('from', next.start);
    params.set('to', next.end);
    apply(params);
  }

  const busy = isDisabled || isPending;
  const window: DateRange = { start: from as DateRange['start'], end: to as DateRange['end'] };

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
      <DateRangeInput
        label={t('customRange')}
        isLabelHidden
        value={window}
        onChange={selectCustomRange}
        hasClear={false}
        size="sm"
        numberOfMonths={1}
        // The API refuses a window ending after today; say so in the calendar
        // rather than after the round trip.
        max={browserToday() as DateRange['end']}
        isDisabled={busy}
      />
    </div>
  );
}
