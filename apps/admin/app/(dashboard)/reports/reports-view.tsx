'use client';

import { useMemo, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type {
  ReportCellValue,
  ReportColumn,
  ReportColumnType,
  ReportDefinition,
  ReportKey,
  ReportRange,
  ReportResult,
} from '@fit/types';
import { Card, Icon, buttonClasses, type IconName } from '@/components/ui';

type T = ReturnType<typeof useTranslations>;

/** The range options offered by the segmented control, in ascending span order. */
const RANGE_OPTIONS: ReadonlyArray<{ value: ReportRange; labelKey: string }> = [
  { value: '7d', labelKey: 'range7d' },
  { value: '30d', labelKey: 'range30d' },
  { value: '12w', labelKey: 'range12w' },
  { value: '12m', labelKey: 'range12m' },
];

/**
 * Per-report card presentation (icon + tinted chip), keyed by {@link ReportKey}.
 * The report's name/description/columns are the catalogue's (the API is the single
 * source of truth for that copy); only the visual accent is chosen here. Any key
 * without an entry falls back to the neutral chart chip, so a future report the
 * API adds still renders rather than crashing.
 */
const REPORT_META: Record<ReportKey, { icon: IconName; chip: string }> = {
  'revenue-by-channel': {
    icon: 'card',
    chip: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300',
  },
  'attendance-by-class': {
    icon: 'check',
    chip: 'bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300',
  },
  'membership-growth': {
    icon: 'users',
    chip: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
  },
  'no-show-rate': {
    icon: 'clock',
    chip: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300',
  },
};

const FALLBACK_META = {
  icon: 'chart' as IconName,
  chip: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-300',
};

/**
 * The Reports screen's client view. Renders the real report {@link ReportDefinition}
 * catalogue as cards, a date-range control, and — when a report is selected — a
 * preview table of its computed rows with CSV / XLSX download links. Selecting a
 * card or a range writes `?report=`/`?range=` to the URL so the server component
 * re-fetches (the data source of truth stays server-side). Every section degrades
 * to an explicit empty state; no figure is invented.
 */
export function ReportsView({
  reports,
  selected,
  range,
  preview,
}: {
  reports: ReportDefinition[];
  selected: ReportKey | null;
  range: ReportRange;
  preview: ReportResult | null;
}) {
  const t = useTranslations('admin.reports');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigate(overrides: Record<string, string>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      params.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  return (
    <div className={`flex flex-col gap-6 ${isPending ? 'opacity-70 transition-opacity' : ''}`}>
      <RangeControl
        value={range}
        onSelect={(next) => navigate({ range: next })}
        disabled={isPending}
        t={t}
      />

      {/* Report catalogue */}
      <section
        aria-label={t('catalogueLabel')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {reports.map((report) => (
          <ReportCard
            key={report.key}
            report={report}
            active={report.key === selected}
            disabled={isPending}
            onSelect={() => navigate({ report: report.key })}
            t={t}
          />
        ))}
      </section>

      {/* Preview */}
      {selected && preview ? (
        <ReportPreview preview={preview} range={range} t={t} />
      ) : (
        <Card glow className="p-8">
          <EmptyState>{t('selectPrompt')}</EmptyState>
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Range control                                                              */
/* -------------------------------------------------------------------------- */

function RangeControl({
  value,
  onSelect,
  disabled,
  t,
}: {
  value: ReportRange;
  onSelect: (next: ReportRange) => void;
  disabled: boolean;
  t: T;
}) {
  return (
    <div
      role="tablist"
      aria-label={t('reportingRange')}
      className="inline-flex w-fit rounded-btn border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
    >
      {RANGE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={`rounded-btn px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:pointer-events-none ${
              active
                ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_4px_14px_-4px_rgba(98,87,227,0.8)]'
                : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
            }`}
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Report card                                                                */
/* -------------------------------------------------------------------------- */

function ReportCard({
  report,
  active,
  disabled,
  onSelect,
  t,
}: {
  report: ReportDefinition;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  t: T;
}) {
  const meta = REPORT_META[report.key] ?? FALLBACK_META;
  return (
    <Card
      glow
      className={`flex h-full flex-col p-5 transition-shadow ${
        active ? 'ring-2 ring-brand-500 dark:ring-brand-400' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-card ${meta.chip}`}>
          <Icon name={meta.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-extrabold tracking-tight text-ink-900 dark:text-white">
            {report.name}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {report.description}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 dark:border-white/10">
        <span className="text-xs text-ink-400 dark:text-ink-500">
          {t('columnCount', { count: report.columns.length })}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onSelect}
          className={buttonClasses(active ? 'primary' : 'ink', 'sm')}
        >
          {active ? t('viewing') : t('run')}
        </button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                     */
/* -------------------------------------------------------------------------- */

function ReportPreview({ preview, range, t }: { preview: ReportResult; range: ReportRange; t: T }) {
  const locale = useLocale();
  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: preview.currency,
        maximumFractionDigits: 2,
      }),
    [preview.currency, locale],
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const exportHref = (format: 'csv' | 'xlsx'): string =>
    `/reports/export?report=${encodeURIComponent(preview.key)}&range=${encodeURIComponent(
      range,
    )}&format=${format}`;

  return (
    <Card glow className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white">
            {preview.name}
          </h2>
          <p className="text-xs text-ink-400 dark:text-ink-500">
            {t('rowCount', { count: preview.rows.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={exportHref('csv')} className={buttonClasses('outline', 'sm')}>
            <Icon name="download" className="h-4 w-4" />
            {t('downloadCsv')}
          </a>
          <a href={exportHref('xlsx')} className={buttonClasses('outline', 'sm')}>
            <Icon name="download" className="h-4 w-4" />
            {t('downloadXlsx')}
          </a>
        </div>
      </div>

      {preview.rows.length === 0 ? (
        <div className="p-8">
          <EmptyState>{t('emptyRows')}</EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left dark:border-white/10">
                {preview.columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400 ${
                      isNumericColumn(column.type) ? 'text-right' : ''
                    }`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr key={i} className="border-b border-ink-100 last:border-0 dark:border-white/5">
                  {preview.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-3 text-ink-700 dark:text-ink-200 ${
                        isNumericColumn(column.type) ? 'text-right font-mono tabular-nums' : ''
                      }`}
                    >
                      {formatCell(column, row[column.key] ?? null, money, number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Right-align the columns Excel would treat as numeric (money / percent / plain number). */
function isNumericColumn(type: ReportColumnType): boolean {
  return type === 'money' || type === 'percent' || type === 'number';
}

/**
 * Format one cell for the on-screen preview by column type: `money` minor-unit
 * integers become a localized currency amount, `percent` a one-decimal figure with
 * a `%` suffix, `number` a grouped integer, and `text`/`date` their own string. A
 * null / empty cell shows an em dash rather than a blank.
 */
function formatCell(
  column: ReportColumn,
  value: ReportCellValue,
  money: Intl.NumberFormat,
  number: Intl.NumberFormat,
): string {
  if (value === null || value === '') {
    return '—';
  }
  switch (column.type) {
    case 'money':
      return money.format(Number(value) / 100);
    case 'percent':
      return `${(Math.round(Number(value) * 10) / 10).toFixed(1)}%`;
    case 'number':
      return number.format(Number(value));
    default:
      return String(value);
  }
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-field border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400 dark:border-white/10 dark:text-ink-500">
      {children}
    </div>
  );
}
