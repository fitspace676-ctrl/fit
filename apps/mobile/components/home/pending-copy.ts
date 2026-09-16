// ===========================================================================
// TODO(i18n) — SIX KEYS THAT DO NOT EXIST. THIS FILE IS A DEBT, NOT A PATTERN.
// ===========================================================================
//
// Plan §6 requires **loading**, **empty** and **error-with-a-working-retry** on
// every screen, and WP-16 found that `member.home` (43 keys) and
// `member.profile.mobile` (55) carry every EMPTY state and **no error, retry or
// loading key at all**. Those are precisely the branches the deleted app
// skipped — §6 item 3 calls the error box out by name — so the branches are
// built here and the sentences are owed.
//
// The instruction for this stage was explicit: render the branch STRUCTURALLY
// and mark it, rather than invent Georgian copy. So:
//
//   * these strings are English placeholders and are **not** translated;
//   * they live in ONE module — the same decision, for the same reason, as
//     `components/auth/pending-copy.ts`: closing the gap is a delete plus six
//     `t()` calls rather than a hunt through eight screens;
//   * every call site carries its own `TODO(i18n)` naming the key it waits for.
//
// THE KEYS OWED:
//
//   | key                                | English placeholder                    |
//   |------------------------------------|----------------------------------------|
//   | `member.home.loading`              | Loading…                               |
//   | `member.home.error`                | We couldn't load this. Please try again.|
//   | `member.home.retry`                | Try again                              |
//   | `member.profile.mobile.loading`    | Loading…                               |
//   | `member.profile.mobile.error`      | We couldn't load this. Please try again.|
//   | `member.profile.mobile.retry`      | Try again                              |
//
// Note the shape of the gap is per-SECTION, not per-screen: Home fans out over
// eight endpoints and each section owns its own error box, so one `error`
// sentence is rendered up to eight times on one screen with a different retry
// behind each. That is deliberate (plan §6 item 1: "skeletons, per section where
// the screen fans out"), and it is why a single shared sentence is the right
// shape for the copy rather than eight bespoke ones.
//
// `components/profile/**` imports from here rather than keeping a second copy:
// two files of English placeholders is two files to forget to delete.
//
// The OFFLINE state has no copy either, and is NOT duplicated here — plan §7
// records that there are zero `offline` keys anywhere in either catalogue, and
// `components/auth/notices.tsx`'s `OfflineNotice` already owns that debt. Every
// screen in this stage renders that component rather than inventing a seventh
// placeholder.
//
// DELETE THIS FILE when WP-16's follow-up lands.

/** The three §6 branches `member.home` has no copy for. English-only, on purpose. */
export const HOME_PENDING_COPY = {
  /** TODO(i18n) `member.home.loading` */
  loading: 'Loading…',
  /** TODO(i18n) `member.home.error` */
  error: "We couldn't load this. Please try again.",
  /** TODO(i18n) `member.home.retry` */
  retry: 'Try again',
} as const;

/**
 * The same three, owed against `member.profile.mobile`.
 *
 * A separate constant rather than one shared object because the two namespaces
 * are separately owed and will be separately authored: `member.home`'s error
 * sentence sits under a section heading, `member.profile.mobile`'s sits under a
 * screen title, and a translator may well want different words. Keeping them
 * apart means closing one gap does not require touching the other's call sites.
 */
export const PROFILE_PENDING_COPY = {
  /** TODO(i18n) `member.profile.mobile.loading` */
  loading: 'Loading…',
  /** TODO(i18n) `member.profile.mobile.error` */
  error: "We couldn't load this. Please try again.",
  /** TODO(i18n) `member.profile.mobile.retry` */
  retry: 'Try again',

  // ── Two more, found while building the achievement rail ──────────────────
  //
  // `AchievementTile` takes a REQUIRED `statusLabel` because earned-versus-
  // locked is a colour swap and nothing else on the artboard: with no spoken
  // status, a screen-reader user hears the same five badge names whether they
  // have earned all five or none. `member.profile.mobile.achievements` carries
  // the five NAMES and no state pair, and neither does any other namespace —
  // the whole catalogue has no "Earned" and no "Locked".
  //
  // **Owed: `member.profile.mobile.achievements.earned` / `.locked`.**

  /** TODO(i18n) `member.profile.mobile.achievements.earned` */
  achievementEarned: 'Earned',
  /** TODO(i18n) `member.profile.mobile.achievements.locked` */
  achievementLocked: 'Not earned yet',
} as const;

/**
 * Goals' unsayable refusal.
 *
 * `member.goals` carries `save`, `saving`, `saved` and `error` ("Couldn't save
 * goals") — every sentence about a save that HAPPENED, and none about one that
 * cannot start. `emptyGoal()` begins with a blank `target`, `isValidDraft`
 * needs a positive one, and a disabled `Button` swallows its own press, so the
 * screen had no way to say what was missing. The live-button + `showErrors`
 * pattern from `app/(join)/checkout.tsx` needs one sentence and the catalogue
 * has none.
 *
 * **Owed: `member.goals.invalid`.**
 */
export const GOALS_PENDING_COPY = {
  /** TODO(i18n) `member.goals.invalid` */
  invalid: 'Every goal needs a name and a target above zero.',
} as const;

/**
 * The inbox's failed WRITE.
 *
 * `notifications` carries `error` — "We couldn't load your notifications." —
 * and that sentence is about the LIST. A `POST /notifications/mark-read` that
 * failed did not fail to load anything: the list is on screen, the dot is still
 * there, and telling the member the inbox would not load is a wrong sentence,
 * not merely an imprecise one. So the branch is built and the key is owed.
 *
 * **Owed: `notifications.markReadError`.**
 */
export const NOTIFICATIONS_PENDING_COPY = {
  /** TODO(i18n) `notifications.markReadError` */
  markReadError: "We couldn't update your notifications.",
} as const;
