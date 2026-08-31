'use client';

// @fit/admin — the "this figure is still gym-wide" annotation for Reports.
//
// PER-REPORT, NOT A PREAMBLE. The obvious alternative — listing all twelve
// un-filterable reports somewhere on the screen when a branch is selected — is a
// wall of text about eleven reports the reader is not looking at, and it sits
// above a table it may or may not be describing. The note instead rides with the
// report it is true of: on the preview's own header when the WHOLE report is
// gym-wide, and beside the affected column names when only part of it is. A
// reader who never opens `member-roster` never reads a word about it, and a
// reader who does opens straight onto the caveat.
//
// It only ever renders with a branch selected. In "All locations" mode every
// figure genuinely is gym-wide, so the sentence is not a caveat, it is the
// definition — printing it there would train people to ignore it.
//
// ONE STRING, `admin.common.notSplitByBranch`. The column names appended after it
// are the API catalogue's own labels, already localized upstream, joined with the
// same ` · ` the header above uses to separate its counts — data, not prose, so
// nothing here needs a sentence template that would have to be translated twice.
//
// Sibling: `segments/branch-scope-note.tsx` makes the same point per dashboard
// tab, carrying a sentence where this one carries a bare label plus the affected
// column names. Not shared code — the two take different inputs and sit in
// different chrome — but they are deliberately the same object on screen, so the
// surface, hairline, radius, padding and icon below are kept in step with it.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui';

const styles = stylex.create({
  // A quiet inline strip, not an alert. Nothing has gone wrong — the figures are
  // correct, they are simply about a wider population than the switcher suggests
  // — so it takes the same surface/hairline treatment as `chrome.notice` at a
  // caption's scale rather than the error box's red.
  note: {
    // `inline-flex` + `align-self`, where the dashboard's is a full-width block:
    // this one sits inside a card header beside a title and two download buttons,
    // and a strip stretched across that header would read as a banner about the
    // card rather than a footnote to the line above it.
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: '0.5rem',
    margin: 0,
    marginTop: '0.125rem',
    maxWidth: '100%',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  icon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-icon-secondary)',
  },
  // The affected columns, in the screen's figure face so they read as references
  // to the table's own headers rather than as more sentence.
  columns: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-primary)',
  },
});

/**
 * "Not split by branch", optionally naming the columns it applies to.
 *
 * Render it only when a branch is actually selected — see the header note. With
 * no `columns` it means the whole table; with `columns` it means those columns of
 * an otherwise branch-scoped table.
 */
export function BranchScopeNote({ columns = [] }: { columns?: readonly string[] }) {
  const t = useTranslations('admin.common');
  return (
    // `role="note"`, matching the dashboard's. No `aria-label` on top of it: the
    // sibling needs one because its visible text is a sentence about the figures
    // rather than a name for the remark, whereas this one's first words ARE the
    // name — labelling it would announce them twice.
    <p role="note" {...stylex.props(styles.note)}>
      <Icon name="info" aria-hidden {...stylex.props(styles.icon)} />
      <span>{t('notSplitByBranch')}</span>
      {columns.length > 0 ? (
        <span {...stylex.props(styles.columns)}>{columns.join(' · ')}</span>
      ) : null}
    </p>
  );
}
