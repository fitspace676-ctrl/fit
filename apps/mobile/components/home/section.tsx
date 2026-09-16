// @fit/mobile — one section of Home, with its own four branches.
//
// ===========================================================================
// NEVER ONE PAGE-LEVEL SPINNER. THIS COMPONENT IS THAT RULE, MADE CHEAP.
//
// Home aggregates eight endpoints. A single `isPending` over all eight means
// the whole screen is blank until the slowest one lands, and a single `isError`
// means one dead upstream blanks a screen that could have shown seven working
// things. The web dashboard solves it by wrapping every fetch in `safe()` — one
// failure yields an empty array and the page still renders. That trick does not
// port: `safe()` throws away the DIFFERENCE between "this gym has no trainers"
// and "the trainers call 500'd", and §6 item 3 requires an error box with a
// **working retry**, which needs the failure kept.
//
// So each section here holds its own query, decides its own phase, and draws
// its own skeleton / error / empty. The cost of that discipline is one
// component, and this is it.
//
// ---------------------------------------------------------------------------
// FOUR PHASES, AND THE THIRD ONE IS THE ONE PEOPLE FORGET.
//
//   loading   skeletons the SIZE OF THE CONTENT they replace, so the page does
//             not jump as eight requests land at eight different moments.
//   offline   `onlineManager` PAUSES a query rather than failing it, so with a
//             dead radio and a cold cache the query sits `isPending` forever,
//             `isError` never becomes true, and the error box never fires. It
//             is a distinct state and it needs a distinct branch — see
//             `sectionPhase`.
//   error     `EmptyState` with a working retry. NOT a toast: a toast
//             auto-dismisses, so a member who looked away has no way back.
//   ready     the caller's children, which own the section's own EMPTY state —
//             "no classes this week" is a different sentence per section and
//             the catalogue has all of them.
//
// ---------------------------------------------------------------------------
// WHY THE HEADING IS HERE AND NOT IN THE CALLER.
//
// A section's heading must survive its own error: a member reading "we couldn't
// load this" needs to know WHAT could not be loaded. Rendering the header
// outside the branch is easy to get wrong once and impossible to notice, so the
// component owns both.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  EmptyState,
  SectionHeader,
  Skeleton,
  spacing,
  type SectionHeaderAction,
} from '@fit/ui-mobile';

import { OfflineNotice } from '../auth/notices';
import { HOME_PENDING_COPY } from './pending-copy';

/** Which of the four branches a section is in. */
export type SectionPhase = 'offline' | 'loading' | 'error' | 'ready';

/** The slice of a TanStack query a section's phase is decided from. */
export interface SectionQueryLike {
  readonly isPending: boolean;
  readonly isError: boolean;
  /** `'paused'` is `onlineManager` holding the request rather than failing it. */
  readonly fetchStatus: 'fetching' | 'paused' | 'idle';
  readonly data: unknown;
}

/**
 * The phase one query is in, given the radio.
 *
 * Order matters and is not arbitrary:
 *
 *   1. **Cached data beats everything.** A section that already has an answer
 *      keeps showing it while a background refetch fails or the radio drops.
 *      Replacing rendered content with an error box because a *refresh* failed
 *      is the most annoying possible reading of "show the error".
 *   2. **Offline beats loading**, because a paused query is `isPending` forever
 *      and would otherwise skeleton for the rest of the session.
 *   3. **Error beats loading**, because a retried query is `isPending` again
 *      while it retries and the box must not flicker away under the finger.
 */
export function sectionPhase(query: SectionQueryLike, online: boolean): SectionPhase {
  if (query.data !== undefined) return 'ready';
  if (!online || query.fetchStatus === 'paused') return 'offline';
  if (query.isError) return 'error';
  if (query.isPending) return 'loading';
  return 'ready';
}

/**
 * The phase of a section that depends on more than one query.
 *
 * The worst phase wins, in the order offline → error → loading → ready: a
 * section whose class list arrived but whose bookings failed cannot claim to be
 * ready, because the cards would render every class as un-booked.
 */
export function combinePhases(...phases: readonly SectionPhase[]): SectionPhase {
  if (phases.includes('offline')) return 'offline';
  if (phases.includes('error')) return 'error';
  if (phases.includes('loading')) return 'loading';
  return 'ready';
}

export interface HomeSectionProps {
  /** Root `testID`. The branch nodes derive theirs from it. */
  testID: string;
  /** The section heading. Omit for a section the artboard draws unheaded. */
  title?: string;
  /** The heading's trailing link — "View all". */
  action?: SectionHeaderAction;
  /** Which branch to draw. */
  phase: SectionPhase;
  /**
   * The error branch's retry. Invalidates the section's own query root — never
   * `.refetch()`, which is what the deleted app did from a dozen call sites
   * until the set drifted from what the server actually changed.
   */
  onRetry: () => void;
  /**
   * The loading branch. Card-shaped, not a spinner — pass the same heights the
   * content will occupy. Defaults to two 96pt blocks, which is right for a list
   * and wrong for a hero, so most callers pass their own.
   */
  skeleton?: ReactNode;
  /** The ready branch. */
  children: ReactNode;
}

/** One section of Home: a heading, and exactly one of four branches under it. */
export function HomeSection({
  testID,
  title,
  action,
  phase,
  onRetry,
  skeleton,
  children,
}: HomeSectionProps) {
  return (
    <View testID={testID} style={{ gap: spacing[3.5] }}>
      {title === undefined ? null : <SectionHeader title={title} action={action} />}

      {phase === 'offline' ? (
        // TODO(i18n): `common.offline.title` / `common.offline.body`. The one
        // marked English placeholder every screen in the app shares — see
        // `components/auth/pending-copy.ts`.
        <OfflineNotice testID={`${testID}-offline`} />
      ) : null}

      {phase === 'loading' ? (
        <View
          testID={`${testID}-loading`}
          accessible
          // TODO(i18n): `member.home.loading`.
          accessibilityLabel={HOME_PENDING_COPY.loading}
          style={{ gap: spacing[3] }}
        >
          {skeleton ?? (
            <>
              <Skeleton height={96} radius={26} />
              <Skeleton height={96} radius={26} />
            </>
          )}
        </View>
      ) : null}

      {phase === 'error' ? (
        <EmptyState
          testID={`${testID}-error`}
          icon="info"
          // TODO(i18n): `member.home.error` / `member.home.retry`.
          title={HOME_PENDING_COPY.error}
          action={{
            label: HOME_PENDING_COPY.retry,
            onPress: onRetry,
            variant: 'secondary',
            testID: `${testID}-retry`,
          }}
        />
      ) : null}

      {phase === 'ready' ? children : null}
    </View>
  );
}
