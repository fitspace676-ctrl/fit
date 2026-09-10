// @fit/mobile — the two advisories every auth screen can raise.
//
// Both are plan §6 states with no copy behind them, so both render English
// placeholders from `pending-copy.ts` and both are marked at every call site.
// See that file's header for the exact keys owed.

import { Alert } from '@fit/ui-mobile';

import { PENDING_COPY, pendingRetryIn } from './pending-copy';

/**
 * Plan §6 item 4 — the offline state.
 *
 * `tone="warning"` rather than `danger`: nothing has failed, the app is telling
 * the user why the button will not work. `live` is off — this is a standing
 * condition, not the result of an action, and a live region here would
 * re-announce itself on every keystroke that re-renders the form.
 *
 * TODO(i18n) `common.offline.title` / `common.offline.body`.
 */
export function OfflineNotice({ testID }: { testID: string }) {
  return (
    <Alert
      testID={testID}
      tone="warning"
      icon="bolt"
      // TODO(i18n): replace with t('common.offline.title') / t('common.offline.body')
      title={PENDING_COPY.offlineTitle}
      body={PENDING_COPY.offlineBody}
    />
  );
}

/**
 * The `authStrict` cool-down — 5 requests per 900s, and the user WILL meet it.
 *
 * `live` IS set here, unlike the offline notice: this is the direct result of
 * pressing submit, and a screen-reader user who has just pressed a button and
 * heard nothing has no way to know the button is now disabled or why.
 *
 * It re-renders once a second with the new count. That is the point — a static
 * "try again later" leaves the user pressing a dead button on a schedule they
 * cannot see — and it is cheap: one `Alert`, no animation.
 *
 * TODO(i18n) `auth.errors.rateLimited`, and `plural('auth.errors.retryIn', …)`
 * for the countdown line.
 */
export function CoolDownNotice({ secondsLeft, testID }: { secondsLeft: number; testID: string }) {
  return (
    <Alert
      testID={testID}
      tone="danger"
      icon="clock"
      live
      // TODO(i18n): replace with t('auth.errors.rateLimited') and
      // plural('auth.errors.retryIn', secondsLeft)
      title={PENDING_COPY.rateLimited}
      body={pendingRetryIn(secondsLeft)}
    />
  );
}
