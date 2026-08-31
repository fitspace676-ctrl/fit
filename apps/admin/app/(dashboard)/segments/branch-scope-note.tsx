'use client';

// "Some of this is still gym-wide" — the caveat a dashboard tab carries while a
// single branch is selected.
//
// WHY THE CONSOLE CARRIES THE WORDING. Several figures on these tabs cannot be
// narrowed to a branch yet: `GymMember` and `Subscription` have no location,
// `CheckIn.locationId` is never written, `PtSession` has no column, and a
// subscription `Invoice` reaches an order — and therefore a branch — only when
// it has one, which the recurring majority does not. The API accepts
// `locationId` on those endpoints and deliberately applies it to nothing (the
// roadmap's exemption register lists each one and what unblocks it). No
// dashboard response schema has a field saying so and none echoes `locationId`
// back, so there is nothing to render off — the strings live here, written
// against the same call-site comments in the API.
//
// Nothing is zeroed or hidden to make a card look filtered. The rule this note
// exists to keep is simply: never present a gym-wide figure as a branch figure
// without saying which is which.
//
// ONLY IN BRANCH MODE. In "All locations" the caveat is not merely redundant, it
// is false — every figure on the tab really is the whole gym, which is what the
// reader asked for. Printing it there would train people to ignore it.
//
// Sibling: `reports/branch-scope-note.tsx` makes the same point per report, and
// takes the same surface/hairline treatment. Not shared code — that one carries
// a bare label plus a list of affected column names, this one a sentence per tab
// — but they are deliberately the same object on screen.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui';
import { useActiveLocation } from '@/components/active-location';

/**
 * The dashboard tabs that have something gym-wide left on them. `sales` is
 * absent on purpose: every figure on that tab filters, so a note there would
 * teach the reader to distrust a number that is correct.
 */
/**
 * The tabs that still have something to disclaim — down to two. `members` and
 * `revenue` went in Stage 2, `overview` in Stage 3, each because the tab started
 * narrowing honestly. A variant kept "just in case" is a variant someone re-adds
 * to the map by accident, so they are removed rather than left unused.
 */
export type BranchScope = 'staff' | 'classes';

const styles = stylex.create({
  // A quiet strip, not an alert. Nothing has gone wrong — the figures are
  // correct, they are simply about a wider population than the switcher
  // suggests — so it takes a surface and a hairline rather than the
  // error-muted box every failed-load banner on these tabs uses.
  note: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  icon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
    // Optically centred on the first line of text rather than its box top.
    marginTop: '0.1875rem',
    color: 'var(--color-icon-secondary)',
  },
  text: {
    margin: 0,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The branch-scope caveat for one tab, or nothing at all when the console is
 * showing every branch.
 *
 * Reads the active branch from context rather than taking it as a prop so the
 * "only in branch mode" rule lives in exactly one place — a call site cannot
 * forget it, and a tab cannot end up showing the caveat over figures the reader
 * asked to be gym-wide.
 */
export function BranchScopeNote({ scope }: { scope: BranchScope }) {
  const t = useTranslations('admin');
  const { locationId } = useActiveLocation();

  if (locationId === undefined) {
    return null;
  }

  return (
    <div
      role="note"
      // Names the region for a screen reader, which otherwise announces an
      // unlabelled note. The sentence inside says which figures; this says what
      // kind of remark it is, before the reader has heard it.
      aria-label={t('common.notSplitByBranch')}
      {...stylex.props(styles.note)}
    >
      <Icon name="info" aria-hidden {...stylex.props(styles.icon)} />
      <p {...stylex.props(styles.text)}>{t(`dashboard.branchScope.${scope}`)}</p>
    </div>
  );
}
