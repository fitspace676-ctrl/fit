// @fit/mobile — the 429 cool-down, as a countdown.
//
// ## Why this is not optional UI
//
// `POST /auth/register`, `POST /auth/forgot-password` and
// `POST /auth/reset-password` all sit behind `authStrict`: **5 requests per 900
// seconds**. That is tight enough that a real person hits it — mistype a
// password twice on the reset screen, request a fresh link, and you are at four.
// The API sets `Retry-After` on every 429 and `lib/http/api-error.ts` parses it
// into `ApiError.retryAfterSec`, so the screen has the exact number.
//
// Three rules, and each of them is a bug the obvious implementation ships:
//
//   1. **Never auto-retry.** Retrying a rate-limit response is precisely what
//      the limiter is defending against; it converts a 15-minute cool-down into
//      a longer one. `lib/query-client.ts` already refuses to retry any 4xx for
//      the same reason. The user re-presses, or nothing happens.
//   2. **Disable submit, and say why.** A button that is enabled and silently
//      fails is indistinguishable from a broken app.
//   3. **Count against a deadline, not a decrementing counter.** A phone
//      suspends its timers in the background; `seconds - 1` on an interval
//      drifts by however long the app was away, so the button re-enables late
//      (or, worse, an eager implementation re-enables early and eats another of
//      the five). The deadline is an absolute timestamp and the tick only reads
//      the clock.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../../lib/http/api-error';

/**
 * Fallback cool-down when a 429 carries no `Retry-After`.
 *
 * `apps/api`'s throttler always sets the header, so this is defence against a
 * proxy that strips it rather than an expected path. 60s is chosen to be long
 * enough to be a real pause and short enough that a stripped header cannot lock
 * a user out for a quarter of an hour on a guess.
 */
export const FALLBACK_COOL_DOWN_SEC = 60;

/** The rate-limit seconds this error implies, or `null` if it is not a 429. */
export function coolDownSecondsFor(error: unknown): number | null {
  if (!ApiError.is(error) || error.status !== 429) return null;
  const fromHeader = error.retryAfterSec;
  if (fromHeader === undefined || !Number.isFinite(fromHeader) || fromHeader <= 0) {
    return FALLBACK_COOL_DOWN_SEC;
  }
  return Math.ceil(fromHeader);
}

/** A live countdown. */
export interface CoolDown {
  /** Whole seconds remaining, `0` when nothing is pending. */
  readonly secondsLeft: number;
  /** `secondsLeft > 0`. The value submit is disabled on. */
  readonly active: boolean;
  /** Begin (or extend) a cool-down. A shorter one never shortens a longer one. */
  readonly start: (seconds: number) => void;
}

/**
 * A one-second countdown against an absolute deadline.
 *
 * The interval is torn down the moment it reaches zero rather than left ticking
 * on a screen with nothing to count, and on unmount — a timer that outlives the
 * screen it belongs to is a `setState` on an unmounted tree and, on a form the
 * user has navigated away from, a wake every second for fifteen minutes.
 */
export function useCoolDown(now: () => number = Date.now): CoolDown {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const deadlineRef = useRef(0);
  // `now` is a seam for the tests, and must not be a dependency of the tick: a
  // caller passing an inline arrow would otherwise re-arm the interval on every
  // render, which is a countdown that never advances.
  const nowRef = useRef(now);
  nowRef.current = now;

  const remaining = useCallback(
    () => Math.max(0, Math.ceil((deadlineRef.current - nowRef.current()) / 1000)),
    [],
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => {
      setSecondsLeft(remaining());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [secondsLeft, remaining]);

  const start = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      const deadline = nowRef.current() + seconds * 1000;
      // A second 429 that answers with a shorter window must not shorten a
      // cool-down already running: the limiter's own answer is the floor, and
      // re-enabling early only spends another of the five requests.
      if (deadline <= deadlineRef.current) return;
      deadlineRef.current = deadline;
      setSecondsLeft(remaining());
    },
    [remaining],
  );

  return { secondsLeft, active: secondsLeft > 0, start };
}
