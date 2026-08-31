import { REPORT_MINOR_PER_MAJOR } from '@fit/types';
import type {
  ReportColumn,
  ReportColumnType,
  ReportDrilldown,
  ReportKpi,
  ReportRow,
  ReportSection,
  ReportValueUnit,
} from '@fit/types';

/**
 * Flattening a drill-down report into tables, so the chart-first screen can be
 * exported as CSV or XLSX (T12.12 + the Sales segment work).
 *
 * A drill-down is several sections of DIFFERENT shapes — a time series, a couple
 * of breakdowns, a detail table — where a catalogue report is one table. This is
 * the one place that decides how each shape becomes rows and columns, so the CSV
 * and the workbook can never disagree about it, and neither can drift from what
 * the screen showed.
 *
 * Column TYPES are reused from the catalogue's own vocabulary
 * ({@link ReportColumnType}) rather than invented here, which is what lets the
 * exporters format a drill-down's money exactly as they format a catalogue
 * report's: minor units on the wire, major-unit decimals in the file.
 */

/** One section of a drill-down, flattened to a titled table. */
export interface TabularSection {
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
}

/** The catalogue column type a drill-down's value unit maps onto. */
function columnTypeFor(unit: ReportValueUnit): ReportColumnType {
  if (unit === 'money') return 'money';
  if (unit === 'percent') return 'percent';
  return 'number';
}

/**
 * The KPI row as its own table.
 *
 * Money and counts share one `Value` column, and a column carries a single type,
 * so the value is written as a plain number with its unit named beside it. That
 * keeps every figure numeric in Excel (sortable, summable) instead of stringifying
 * "7 243 ₾" into a cell nobody can compute with, and it stays unambiguous about
 * which figure is currency.
 */
function kpiTable(kpis: ReportKpi[], currency: string, labels: TabularLabels): TabularSection {
  return {
    title: labels.summary,
    columns: [
      { key: 'metric', label: labels.metric, type: 'text' },
      { key: 'value', label: labels.value, type: 'number' },
      { key: 'unit', label: labels.unit, type: 'text' },
    ],
    rows: kpis.map((kpi) => ({
      metric: kpi.label,
      // Money arrives in MINOR units like everywhere else on the wire; the file
      // carries major units, the same conversion the catalogue exporters apply.
      value: kpi.unit === 'money' ? kpi.value / REPORT_MINOR_PER_MAJOR : kpi.value,
      unit: kpi.unit === 'money' ? currency : kpi.unit === 'percent' ? '%' : 'count',
    })),
  };
}

/** One section flattened to a titled table, by its `kind`. */
function sectionTable(section: ReportSection): TabularSection {
  switch (section.kind) {
    case 'series':
      return {
        title: section.title,
        columns: [
          { key: 'period', label: 'Period', type: 'date' },
          { key: 'value', label: section.title, type: columnTypeFor(section.unit) },
        ],
        rows: section.points.map((point) => ({ period: point.label, value: point.value })),
      };

    case 'breakdown':
      return {
        title: section.title,
        columns: [
          { key: 'label', label: 'Item', type: 'text' },
          { key: 'value', label: section.title, type: columnTypeFor(section.unit) },
        ],
        rows: section.items.map((item) => ({ label: item.label, value: item.value })),
      };

    case 'split':
      return {
        title: section.title,
        columns: [
          { key: 'label', label: 'Slice', type: 'text' },
          { key: 'value', label: section.title, type: columnTypeFor(section.unit) },
        ],
        rows: section.slices.map((slice) => ({ label: slice.label, value: slice.value })),
      };

    case 'heatmap':
      // The grid transposes into one row per row-label, one column per col-label —
      // the shape a reader would rebuild the heatmap from, and the only 2-D
      // arrangement a spreadsheet can hold without losing an axis.
      return {
        title: section.title,
        columns: [
          { key: 'row', label: '', type: 'text' },
          ...section.colLabels.map(
            (label, index): ReportColumn => ({ key: `c${index}`, label, type: 'number' }),
          ),
        ],
        rows: section.rowLabels.map((rowLabel, rowIndex) => {
          const row: ReportRow = { row: rowLabel };
          section.colLabels.forEach((_, colIndex) => {
            row[`c${colIndex}`] = section.cells[rowIndex]?.[colIndex] ?? null;
          });
          return row;
        }),
      };

    case 'table':
      return { title: section.title, columns: section.columns, rows: section.rows };
  }
}

/**
 * A whole drill-down as titled tables, in screen order: the KPI summary first,
 * then one table per section. An empty section still produces its table (headers
 * and no rows), because "this section had nothing in the window" is an answer the
 * export should carry rather than silently omit.
 */
/** The fixed words of the KPI summary tab, in the file's language. */
export interface TabularLabels {
  summary: string;
  metric: string;
  value: string;
  unit: string;
}

const ENGLISH_LABELS: TabularLabels = {
  summary: 'Summary',
  metric: 'Metric',
  value: 'Value',
  unit: 'Unit',
};

export function drilldownTables(
  drilldown: ReportDrilldown,
  labels: TabularLabels = ENGLISH_LABELS,
): TabularSection[] {
  return [
    kpiTable(drilldown.kpis, drilldown.currency, labels),
    ...drilldown.sections.map(sectionTable),
  ];
}
