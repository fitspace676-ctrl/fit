'use client';

// @fit/admin — the Reports screen's client view (T11.22).
//
// A SEARCHABLE MASTER / DETAIL screen: a scrollable index of the gym's reports on
// the left, the selected report's preview beside it on the right. Selecting a
// report writes `?report=` to the URL so the server component re-fetches (the
// data source of truth stays server-side). Every section degrades to an explicit
// empty state; no figure is invented.
//
// It replaces a grid of 27 identical cards, and the three things wrong with that
// grid are the three things this layout exists to fix.
//
//   1. THE PREVIEW WAS OFF SCREEN. The catalogue ran ~1600px tall and the preview
//      table rendered underneath all of it, so clicking a card appeared to do
//      nothing. The preview now sits BESIDE the index, in view at the moment of
//      the click. This is the single biggest reason for the two-pane shape.
//
//   2. THERE WAS NO WAY TO FIND ANYTHING. Twenty-seven reports and no search. The
//      toolbar's field filters the index live across name, purpose, and segment,
//      so "refund" narrows to three rows instead of a scan of the whole page.
//
//   3. EVERY CELL WEIGHED THE SAME. Each card carried a 2-line clamped purpose and
//      a "5 columns" footnote, which is not a fact anyone chooses a report by. An
//      index row is now the report's NAME and nothing else, so a rail-height of
//      rows scans in one pass; the purpose and the column count both move to the
//      detail pane, where they describe the thing you are about to download.
//
// The old hairline grid also needed FILLER CELLS, because an unfilled grid area
// showed as a solid block of border colour. A list has no cell count to satisfy,
// so the fillers are gone with it.
//
// The `?range=` control lives HERE now, in the same toolbar as the search, rather
// than in a page header of its own. The two controls that govern this screen are
// one control surface; splitting them across two rows was why the range segment
// used to float alone against empty space.
//
// Presentation is Astryx `Card` / `Button` / `TextInput` over the Fit brand theme
// tokens, with all layout authored in compiled StyleX — no Tailwind utilities and
// no FormaCore Aurora-glass primitives.

import { useDeferredValue, useMemo, useState, useTransition, type ReactNode } from 'react';
import { Card } from '@fit/ui-kit';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import type { NumberFormatter } from '@fit/i18n';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { groupReportsBySegment } from '@fit/types';
import type {
  ReportCellValue,
  ReportColumn,
  ReportColumnType,
  ReportDefinition,
  ReportKey,
  ReportRange,
  ReportResult,
  ReportSegment,
} from '@fit/types';
import { Icon, type IconName } from '@/components/ui';
import { adminPath } from '@/lib/base-path';
import { chrome } from './report-chrome';

type T = ReturnType<typeof useTranslations>;

/** The range options offered by the toolbar's segmented control, ascending by span. */
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
    gap: '1rem',
  },
  pending: {
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: {
      default: '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },

  /* ---------------------------------------------------------------------- */
  /*  Toolbar                                                                */
  /* ---------------------------------------------------------------------- */

  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  search: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '16rem',
    maxWidth: '24rem',
  },
  searchIcon: {
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-secondary)',
  },

  /* ---------------------------------------------------------------------- */
  /*  Body                                                                   */
  /* ---------------------------------------------------------------------- */

  // The catalogue is TWO HORIZONTAL STRIPS above a full-width table, not a rail
  // beside one.
  //
  // The rail was a 20rem column that, once the segments collapsed, held five short
  // headings and then roughly nine hundred pixels of nothing, while a five-column
  // table of currency ran in the remaining two thirds. A split earns its width when
  // both sides have something to say; this one had stopped. Promoting the segments
  // to a tab strip and their reports to a row of chips costs about 7rem of height,
  // returns the full page width to the figures, and puts the choice that governs
  // the screen at the top of it rather than off to one side.
  //
  // The objection this layout used to face — that the catalogue pushed the preview
  // off screen — was about a ~1600px grid of cards. Two strips are nowhere near
  // that: the table's first rows are still above the fold.
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  /* ---------------------------------------------------------------------- */
  /*  Segment tabs                                                           */
  /* ---------------------------------------------------------------------- */

  // The five segments, as the screen's top-level choice.
  //
  // ONE ACCENT ON THE SCREEN, and it is the brand's. A previous pass coded each
  // segment in its own hue — blue, teal, green, orange, purple — which did make the
  // groups findable, but it put five accents on a console that already has a brand
  // colour, and every tinted control then had to argue with the next one about
  // which was the important thing. The segment is named in words directly above its
  // own reports; it does not also need a colour. Indigo is now the only non-neutral
  // in either strip, and it means exactly one thing: THIS is the one you are on.
  //
  // Emphasis comes from CONTRAST AND SCALE instead of hue. The labels were 11px
  // uppercase captions in the old rail, which is the size you set something at when
  // it annotates something more important than itself. Which of the five families
  // you are in is the first decision this screen asks for, so the labels are 16px,
  // in sentence case, at the scale of a page-level control.
  //
  // Sentence case, not the tracked-out caps: "Classes & training" in 12px caps at
  // 0.12em is wider than the same words at 16px, and five of those overflow before
  // the strip ever feels big.
  // Centred, and on its own recessed track.
  //
  // NO RULE UNDER THE STRIP. A full-width hairline is what an underline tab bar
  // needs, because the underline marking the active tab has to sit IN something.
  // Once the strip is a self-contained track that argument disappears: the group
  // has its own edges, so the line was only drawing a second horizontal rule a few
  // pixels above the card's own.
  //
  // The track is what "more styled" gets spent on. A recessed 5% well with a raised
  // indigo pill riding in it is a real material relationship — pressed into the
  // page, one segment lifted out — where a row of bare words underlined at one end
  // is just text with a mark under it.
  tabsWrap: {
    display: 'flex',
    justifyContent: 'center',
  },
  tabs: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.125rem',
    maxWidth: '100%',
    // The track scrolls rather than wraps on a narrow screen: a segmented control
    // that reflows to two lines stops reading as one row of peers.
    overflowX: 'auto',
    overscrollBehaviorInline: 'contain',
    borderRadius: '0.875rem',
    backgroundColor: 'var(--color-overlay-hover)',
    padding: '0.25rem',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: '0.625rem',
    backgroundColor: 'transparent',
    paddingInline: '1rem',
    paddingBlock: '0.5625rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    color: 'var(--color-text-secondary)',
    transitionProperty: 'background-color, color',
    transitionDuration: {
      default: '140ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    ':hover:not(:disabled)': {
      color: 'var(--color-text-primary)',
      backgroundColor: 'var(--color-overlay-pressed)',
    },
    ':focus-visible': {
      outline: '2px solid var(--color-accent)',
      outlineOffset: '2px',
    },
    ':disabled': {
      cursor: 'default',
    },
  },
  // Solid brand indigo, labelled in `--color-background-card` for the same reason
  // the chips are — `--color-on-accent` is white in both themes, and white on the
  // dark theme's paler indigo measures 3.10:1. The card colour inverts with the
  // theme and clears AA on both (4.88:1 dark, 5.26:1 light).
  //
  // The same fill as the active chip, deliberately: indigo means "current" on this
  // screen, and it should not mean one thing in the top row and another in the
  // second. Scale carries the hierarchy instead — 16px for the family you are in,
  // 13px for the report you are reading.
  tabActive: {
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover:not(:disabled)': 'var(--color-accent)',
    },
    color: {
      default: 'var(--color-background-card)',
      ':hover:not(:disabled)': 'var(--color-background-card)',
    },
  },
  // How many reports the tab leads to. Mono and tabular so the five counts read as
  // figures rather than drifting with their glyph widths, and carried on the tab's
  // OWN ink at reduced opacity — a fixed grey would be unreadable once the tab
  // under it fills with indigo.
  tabCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: '0.75rem',
    fontWeight: 400,
    color: 'currentColor',
    opacity: 0.6,
  },
  /* ---------------------------------------------------------------------- */
  /*  Report chips                                                           */
  /* ---------------------------------------------------------------------- */

  // The active segment's reports, as a row of pills.
  //
  // WRAP, not scroll — the opposite call from the tab strip above, and for the
  // opposite reason. The tabs are a fixed set of five the reader has to see as
  // peers, so they stay on one line. These are up to seven of a changing set, and
  // any of them may be the one wanted; a chip hidden past a horizontal edge is a
  // report the reader will not find. Two rows of chips is a fine shape, a chip
  // scrolled out of view is not.
  // Centred under the centred track, and spaced off it — with the strip's hairline
  // gone, the two rows need air between them or they read as one block.
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.5rem',
    marginTop: '0.75rem',
  },
  // A SOFT CHIP: filled, borderless, on a moderate radius.
  //
  // The version this replaces was an outlined full-pill with the icon sitting on
  // its own filled disc inside it — a bubble in a capsule. Three edges were being
  // drawn per chip (the pill's stroke, the disc's fill, the glyph itself) to
  // deliver one word, and seven of those in a row is a strip of lozenges rather
  // than a set of choices. Every one of those edges is gone:
  //
  //   • No border. A 5%-tint fill gives the chip a shape without a stroke, which
  //     is what stops seven of them reading as seven outlines.
  //   • No disc under the icon. The glyph sits on the chip's own ink, at the
  //     label's weight, and reads as part of the word rather than a badge beside
  //     it.
  //   • Radius 0.5rem, not a capsule. Full pills on dense tool chrome read as
  //     tags — something applied to a record — and these are navigation.
  //
  // Selection is the one filled thing: solid brand indigo, white label, white
  // glyph. Against six soft-grey chips it needs no border, no tint and no second
  // hue to be found.
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4375rem',
    maxWidth: '100%',
    borderWidth: 0,
    borderRadius: '0.5rem',
    backgroundColor: 'var(--color-overlay-hover)',
    paddingInline: '0.6875rem',
    paddingBlock: '0.4375rem',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    transitionProperty: 'background-color, color',
    transitionDuration: {
      default: '140ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    ':hover:not(:disabled)': {
      color: 'var(--color-text-primary)',
      backgroundColor: 'var(--color-overlay-pressed)',
    },
    ':focus-visible': {
      outline: '2px solid var(--color-accent)',
      outlineOffset: '2px',
    },
    ':disabled': {
      cursor: 'default',
    },
  },
  // Solid brand indigo, labelled in `--color-background-card`.
  //
  // NOT `--color-on-accent`. That token is white in both modes, and the dark
  // theme's accent is the LIGHTER of the two indigos (`#9184F1` against light
  // mode's `#6257E3`) — so white-on-accent measures 3.10:1 there and fails AA for
  // 13px text, while passing at 5.26:1 in light. The card colour inverts with the
  // theme exactly as needed: near-black on the pale dark-mode indigo (4.88:1) and
  // white on the saturated light-mode one (5.26:1). One token, AA in both.
  //
  // Hover is re-declared, or the chip's own hover rule repaints the selected chip
  // in plain ink and it appears to deselect itself under the cursor.
  chipActive: {
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover:not(:disabled)': 'var(--color-accent)',
    },
    color: {
      default: 'var(--color-background-card)',
      ':hover:not(:disabled)': 'var(--color-background-card)',
    },
  },
  // Bare, inheriting the chip's ink, and a shade under the label's cap height so it
  // sits with the word rather than anchoring it. No opacity of its own: the ink it
  // inherits is already secondary when the chip is idle, and dimming the glyph on
  // the filled chip only muddies it.
  chipIcon: {
    width: '0.9375rem',
    height: '0.9375rem',
    flexShrink: 0,
  },
  chipName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.8125rem',
    fontWeight: 500,
    letterSpacing: '-0.005em',
    color: 'currentColor',
  },
  // The selected report is the only name in the row at weight 600, so the marker
  // survives for a reader who cannot make out the indigo.
  chipNameActive: {
    fontWeight: 600,
  },

  /* ---------------------------------------------------------------------- */
  /*  Detail pane                                                            */
  /* ---------------------------------------------------------------------- */

  detailCard: {
    overflow: 'hidden',
  },
  detailHead: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-start',
    },
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    paddingInline: '1.25rem',
    paddingBlock: '1rem',
  },
  detailTitleBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    minWidth: 0,
  },
  detailTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  detailDesc: {
    margin: 0,
    maxWidth: '46rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
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
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    minWidth: '36rem',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    textAlign: 'left',
  },
  th: {
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  // The hover tint is not decoration: these tables run to 31 rows of right-aligned
  // figures, and a lit row is what keeps the eye on one period while it travels
  // across five columns.
  bodyRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    transitionProperty: 'background-color',
    transitionDuration: {
      default: '120ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    ':hover': {
      backgroundColor: 'var(--color-background-muted)',
    },
  },
  bodyRowLast: {
    borderBottomWidth: 0,
  },
  td: {
    paddingInline: '1.25rem',
    paddingBlock: '0.75rem',
    color: 'var(--color-text-primary)',
  },
  numericHead: {
    textAlign: 'right',
  },
  numericCell: {
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },

  /* ---------------------------------------------------------------------- */
  /*  Empty states                                                           */
  /* ---------------------------------------------------------------------- */

  // A quiet composition of type, not a dashed placeholder box. A dashed rectangle
  // reads as a slot waiting to be filled by the system; these states are waiting
  // on the reader, and say so.
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.625rem',
    minHeight: '12rem',
    paddingInline: '1.5rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '1.25rem',
    height: '1.25rem',
    color: 'var(--color-text-disabled)',
  },
  emptyText: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  emptyRows: {
    display: 'grid',
    minHeight: '5rem',
    placeItems: 'center',
    paddingInline: '1rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The icon that leads each index row, keyed by {@link ReportKey}. The report's
 * name / description / columns are the catalogue's — the API is the single source
 * of truth for that copy — and only the glyph is chosen here. Any key without an
 * entry falls back to the neutral chart glyph, so a report the API adds later
 * still renders rather than crashing.
 *
 * There is no per-report colour. These glyphs are wayfinding, not status, and a
 * different hue per report put competing accents on one screen.
 */
const REPORT_ICONS: Partial<Record<ReportKey, IconName>> = {
  // Sales
  'sales-summary': 'chart',
  'sales-by-payment-method': 'card',
  'plan-performance': 'award',
  'sales-by-staff': 'briefcase',
  'discounts-and-promotions': 'tag',
  'refunds-detail': 'minus',
  'pos-transaction-log': 'bag',
  // Members
  'membership-movement': 'users',
  'retention-and-churn': 'target',
  'members-at-risk': 'bell',
  'expiring-memberships': 'calendar',
  'member-roster': 'users',
  'member-check-in-log': 'qr',
  'upcoming-occasions': 'star',
  // Revenue
  'revenue-summary': 'chart',
  'revenue-by-channel': 'grid',
  'revenue-by-location': 'pin',
  'outstanding-invoices': 'info',
  'projected-revenue': 'arrow',
  'refunds-accounting': 'minus',
  // Classes
  'attendance-by-class': 'check',
  'class-utilization': 'grid',
  'class-cancellations': 'x',
  'waitlist-demand': 'flame',
  'pt-sessions': 'dumbbell',
  'no-show-rate': 'clock',
  // Staff
  'trainer-performance': 'award',
};

const FALLBACK_ICON: IconName = 'chart';

/**
 * The hue each segment is coded in — see the `tone*` styles for why the rail is
 * colour-coded at all, and why the coding is per SEGMENT rather than per report.
 * Exhaustive over {@link ReportSegment}, so a segment added to the shared catalogue
 * is a type error here rather than an uncoloured group at runtime.
 */
/**
 * The segment the tab strip opens on when the URL names no report, and the fallback
 * for a report whose segment somehow is not in the catalogue. First in
 * `REPORT_SEGMENTS`, matching {@link DEFAULT_REPORT_KEY}'s own group.
 */
const DEFAULT_SEGMENT: ReportSegment = 'sales';

/**
 * Whether `report` matches the search `query`, across its display name, its
 * purpose, and the segment it is filed under — so "sales" finds the whole Sales
 * group and "refund" finds the three reports about refunds regardless of which
 * group they sit in. An empty query matches everything.
 */
function matchesQuery(report: ReportDefinition, segmentLabel: string, query: string): boolean {
  if (query === '') {
    return true;
  }
  const haystack = `${report.name} ${report.description} ${segmentLabel}`.toLowerCase();
  return haystack.includes(query);
}

/**
 * The Reports screen's client view. Renders the gym's report {@link ReportDefinition}
 * catalogue as a searchable index and, beside it, the selected report's previewed
 * rows with CSV / XLSX download links. Selecting a report — and changing the
 * reporting range — writes to the URL so the server component re-fetches; the
 * search box is the one piece of state that stays client-side, because filtering a
 * list already in memory has nothing to fetch.
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
  const [query, setQuery] = useState('');

  // Which segment tab is open. Always one — the strip is a choice between five
  // families, not a set of toggles, and a state with none chosen would leave the
  // chip row empty for no reason a reader could act on.
  //
  // It starts on the segment of the report already being previewed, so the screen
  // never loads with the marked chip on a tab you would have to find.
  const [activeSegment, setActiveSegment] = useState<ReportSegment>(
    () => reports.find((report) => report.key === selected)?.segment ?? DEFAULT_SEGMENT,
  );

  // Filtering 27 rows is cheap, but deferring it keeps typing responsive while a
  // `?report=` transition is already re-rendering the pane beside the list.
  const deferredQuery = useDeferredValue(query);

  function setParam(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  // Grouped by the API's own segment field, in the shared segment order, THEN
  // filtered. The hub never decides which groups exist: a segment with no reports
  // (or none left after the search) is absent, so a group cannot render as an
  // empty heading.
  const needle = deferredQuery.trim().toLowerCase();
  const groups = useMemo(
    () =>
      groupReportsBySegment(reports)
        .map((group) => ({
          ...group,
          reports: group.reports.filter((report) => matchesQuery(report, group.label, needle)),
        }))
        .filter((group) => group.reports.length > 0),
    [reports, needle],
  );

  // The tab strip is drawn from the filtered groups, so a search rewrites BOTH
  // strips at once: the counts become match counts, and a segment with nothing
  // matching drops out of the strip rather than sitting there leading nowhere.
  //
  // DERIVED, not stored. If the active tab is one the search just eliminated, the
  // first surviving group stands in for it — computed during render rather than
  // pushed back into state, because a `setState` in render to repair state is how
  // a tab strip ends up fighting the search box for control of itself. The stored
  // choice is left alone and comes back when the query clears.
  const shown = groups.find((group) => group.segment === activeSegment) ?? groups[0] ?? null;

  function selectReport(report: ReportDefinition): void {
    // Follow the selection with the tab. Picking a match out of a search and then
    // clearing the box would otherwise land the reader on whichever tab happened to
    // be stored, with the chosen report nowhere on screen.
    setActiveSegment(report.segment);
    setParam('report', report.key);
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.search)}>
          <TextInput
            label={t('searchLabel')}
            isLabelHidden
            type="text"
            size="md"
            width="100%"
            value={query}
            onChange={setQuery}
            placeholder={t('searchPlaceholder')}
            hasClear
            startIcon={<Icon name="search" {...stylex.props(styles.searchIcon)} />}
          />
        </div>
        <SegmentedControl
          value={range}
          onChange={(next) => setParam('range', next)}
          label={t('reportingRange')}
          size="sm"
          isDisabled={isPending}
        >
          {RANGE_OPTIONS.map((option) => (
            <SegmentedControlItem
              key={option.value}
              value={option.value}
              label={t(option.labelKey)}
            />
          ))}
        </SegmentedControl>
      </div>

      {shown === null ? (
        <Card padding="none">
          <EmptyState icon="search">
            {needle === '' ? (
              // Not "no matches" — nothing was searched. This is a gym that has
              // switched every report off, and the only place it can undo that
              // is Settings.
              <p {...stylex.props(styles.emptyText)}>{t('noneEnabled')}</p>
            ) : (
              <>
                <p {...stylex.props(styles.emptyText)}>{t('noMatches', { query: query.trim() })}</p>
                <Button
                  label={t('clearSearch')}
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuery('')}
                />
              </>
            )}
          </EmptyState>
        </Card>
      ) : (
        <div {...stylex.props(styles.body, isPending && styles.pending)}>
          {/* `tablist` / `tab` / `tabpanel` rather than a list of links: the strip
              swaps which reports the panel below offers without navigating, which
              is what the tab pattern describes. The chip row is the panel, and it
              is labelled by whichever tab is up. */}
          <nav aria-label={t('catalogueLabel')}>
            <div {...stylex.props(styles.tabsWrap)}>
              <div role="tablist" {...stylex.props(styles.tabs)}>
                {groups.map((group) => {
                  const active = group.segment === shown.segment;
                  return (
                    <button
                      key={group.segment}
                      type="button"
                      role="tab"
                      id={`report-segment-${group.segment}`}
                      aria-selected={active}
                      aria-controls={`report-segment-panel-${group.segment}`}
                      disabled={isPending}
                      onClick={() => setActiveSegment(group.segment)}
                      {...stylex.props(styles.tab, active && styles.tabActive)}
                    >
                      {group.label}
                      <span {...stylex.props(styles.tabCount)}>{group.reports.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              role="tabpanel"
              id={`report-segment-panel-${shown.segment}`}
              aria-labelledby={`report-segment-${shown.segment}`}
              {...stylex.props(styles.chipRow)}
            >
              {shown.reports.map((report) => (
                <ReportChip
                  key={report.key}
                  report={report}
                  active={report.key === selected}
                  disabled={isPending}
                  onSelect={() => selectReport(report)}
                />
              ))}
            </div>
          </nav>

          {preview ? (
            <ReportPreview
              preview={preview}
              // `ReportResult` carries no purpose line, so the catalogue supplies it.
              description={reports.find((report) => report.key === selected)?.description ?? null}
              range={range}
              t={t}
            />
          ) : (
            <Card padding="none">
              <EmptyState icon="chart">
                <p {...stylex.props(styles.emptyText)}>{t('selectPrompt')}</p>
              </EmptyState>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Report chip                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One report in the chip row. The whole chip is the control — a report is picked by
 * choosing it, so a separate "Run" button inside it would be a second target for one
 * action. `aria-current` rather than `aria-pressed`: this is navigation within a
 * set, not a toggle, and it is what tells a reader who cannot see the filled tile
 * which report the table below them is showing.
 *
 * The purpose line rides on `title`, as it did on the rail's rows — the chip has
 * room for a name and nothing else, and the same sentence is printed in full above
 * the table the moment the chip is chosen.
 */
function ReportChip({
  report,
  active,
  disabled,
  onSelect,
}: {
  report: ReportDefinition;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      disabled={disabled}
      onClick={onSelect}
      title={report.description}
      {...stylex.props(styles.chip, active && styles.chipActive)}
    >
      <Icon
        name={REPORT_ICONS[report.key] ?? FALLBACK_ICON}
        aria-hidden
        {...stylex.props(styles.chipIcon)}
      />
      <span {...stylex.props(styles.chipName, active && styles.chipNameActive)}>{report.name}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                    */
/* -------------------------------------------------------------------------- */

function ReportPreview({
  preview,
  description,
  range,
  t,
}: {
  preview: ReportResult;
  description: string | null;
  range: ReportRange;
  t: T;
}) {
  const locale = useLocale();
  const money = useMemo(
    () =>
      createNumberFormat(locale, {
        style: 'currency',
        currency: preview.currency,
        maximumFractionDigits: 2,
      }),
    [preview.currency, locale],
  );
  const number = useMemo(() => createNumberFormat(locale), [locale]);

  // Renders as a plain anchor so the browser downloads the file, so the basePath is
  // not applied for us.
  const exportHref = (format: 'csv' | 'xlsx'): string =>
    adminPath(
      `/reports/export?report=${encodeURIComponent(preview.key)}&range=${encodeURIComponent(
        range,
      )}&format=${format}`,
    );

  return (
    <Card padding="none" xstyle={styles.detailCard}>
      <div {...stylex.props(styles.detailHead)}>
        <div {...stylex.props(styles.detailTitleBox)}>
          <h2 {...stylex.props(styles.detailTitle)}>{preview.name}</h2>
          {description ? <p {...stylex.props(styles.detailDesc)}>{description}</p> : null}
          {/* What you are about to download, in one line: how many rows the range
              produced, and how wide the file will be. */}
          <p {...stylex.props(chrome.num)}>
            {t('rowCount', { count: preview.rows.length })}
            {' · '}
            {t('columnCount', { count: preview.columns.length })}
          </p>
        </div>
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

      {preview.rows.length === 0 ? (
        <p {...stylex.props(styles.emptyRows)}>{t('emptyRows')}</p>
      ) : (
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr {...stylex.props(styles.headRow)}>
                {preview.columns.map((column) => (
                  <th
                    key={column.key}
                    {...stylex.props(styles.th, isNumericColumn(column.type) && styles.numericHead)}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, i) => (
                <tr
                  key={i}
                  {...stylex.props(
                    styles.bodyRow,
                    i === preview.rows.length - 1 && styles.bodyRowLast,
                  )}
                >
                  {preview.columns.map((column) => (
                    <td
                      key={column.key}
                      {...stylex.props(
                        styles.td,
                        isNumericColumn(column.type) && styles.numericCell,
                      )}
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
  money: NumberFormatter,
  number: NumberFormatter,
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

/** A centred glyph over its message, for "nothing picked yet" and "nothing found". */
function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.empty)}>
      <Icon name={icon} aria-hidden {...stylex.props(styles.emptyIcon)} />
      {children}
    </div>
  );
}
