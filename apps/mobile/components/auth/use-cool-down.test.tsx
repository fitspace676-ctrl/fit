// The 429 cool-down, at the seam the screens cannot reach.
//
// Three of its rules are invisible from a screen test, because the screen
// disables submit for the whole window and so can never deliver a SECOND 429:
//
//   * a shorter second window must not shorten a longer one already running;
//   * the countdown is measured against an absolute DEADLINE, not a decrementing
//     counter, so a phone that suspended its timers for ten seconds comes back
//     ten seconds further along rather than ten seconds late;
//   * the interval is torn down at zero and on unmount, so a form the user
//     walked away from does not wake once a second for fifteen minutes.
//
// This file is a `.test.tsx` and not a `.spec.ts` even though the module is
// nearly renderer-free: `vitest.config.ts` includes only `lib/**` and `hooks/**`
// (plus the one `app/**/*.spec.ts` exception), so a spec under `components/`
// would be run by neither runner — which is the quietest way for a test to not
// exist.

import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../lib/http/api-error';
import { coolDownSecondsFor, FALLBACK_COOL_DOWN_SEC, useCoolDown } from './use-cool-down';

describe('coolDownSecondsFor', () => {
  it('answers null for anything that is not a 429', () => {
    expect(
      coolDownSecondsFor(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' })),
    ).toBeNull();
    expect(coolDownSecondsFor(new ApiError({ status: 503, code: 'UNAVAILABLE' }))).toBeNull();
    expect(coolDownSecondsFor(new ApiError({ status: 0, code: 'NETWORK_ERROR' }))).toBeNull();
    expect(coolDownSecondsFor(new Error('boom'))).toBeNull();
    expect(coolDownSecondsFor(undefined)).toBeNull();
  });

  it('takes `Retry-After` when the API sent one, rounding up', () => {
    const at = (retryAfterSec: number) =>
      coolDownSecondsFor(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec }));

    expect(at(900)).toBe(900);
    // A part-second must round UP: rounding down re-enables the button before
    // the limiter is ready and spends one of the five on a certain rejection.
    expect(at(2.1)).toBe(3);
  });

  it('falls back when a proxy stripped the header, or sent nonsense', () => {
    const withHeader = (retryAfterSec?: number) =>
      coolDownSecondsFor(new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec }));

    expect(withHeader(undefined)).toBe(FALLBACK_COOL_DOWN_SEC);
    expect(withHeader(0)).toBe(FALLBACK_COOL_DOWN_SEC);
    expect(withHeader(-5)).toBe(FALLBACK_COOL_DOWN_SEC);
    expect(withHeader(Number.NaN)).toBe(FALLBACK_COOL_DOWN_SEC);
    expect(withHeader(Number.POSITIVE_INFINITY)).toBe(FALLBACK_COOL_DOWN_SEC);

    // 60 rather than the limiter's own 900: a stripped header must not be able
    // to lock a user out for a quarter of an hour on a guess.
    expect(FALLBACK_COOL_DOWN_SEC).toBe(60);
  });
});

describe('useCoolDown', () => {
  /** A clock the test moves by hand, so "elapsed" is not "ticks fired". */
  function fakeClock(start = 1_000_000) {
    let t = start;
    return {
      now: () => t,
      advance: (ms: number) => {
        t += ms;
      },
    };
  }

  it('is idle until something starts it', () => {
    const { result } = renderHook(() => useCoolDown(() => 0));

    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.active).toBe(false);
  });

  it('counts down once a second and goes idle at zero', () => {
    jest.useFakeTimers();
    try {
      const clock = fakeClock();
      const { result } = renderHook(() => useCoolDown(clock.now));

      act(() => {
        result.current.start(3);
      });
      expect(result.current.secondsLeft).toBe(3);
      expect(result.current.active).toBe(true);

      act(() => {
        clock.advance(1000);
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.secondsLeft).toBe(2);

      act(() => {
        clock.advance(2000);
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.secondsLeft).toBe(0);
      expect(result.current.active).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads the CLOCK, not the tick count — a suspended phone catches up', () => {
    // The bug this pins: `seconds - 1` on an interval. A backgrounded app stops
    // firing intervals, so a decrementing counter comes back believing only as
    // much time passed as it managed to tick. Here ten seconds of wall clock
    // pass while exactly one tick fires, and the answer is still right.
    jest.useFakeTimers();
    try {
      const clock = fakeClock();
      const { result } = renderHook(() => useCoolDown(clock.now));

      act(() => {
        result.current.start(30);
      });
      expect(result.current.secondsLeft).toBe(30);

      act(() => {
        clock.advance(10_000);
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.secondsLeft).toBe(20);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a shorter second window never shortens a longer one already running', () => {
    jest.useFakeTimers();
    try {
      const clock = fakeClock();
      const { result } = renderHook(() => useCoolDown(clock.now));

      act(() => {
        result.current.start(900);
      });
      expect(result.current.secondsLeft).toBe(900);

      // The limiter's answer is the FLOOR. Re-arming on a shorter one would
      // re-enable the button early and spend another of the five requests on a
      // rejection that is already guaranteed.
      act(() => {
        result.current.start(5);
      });
      expect(result.current.secondsLeft).toBe(900);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a longer second window does extend it', () => {
    jest.useFakeTimers();
    try {
      const clock = fakeClock();
      const { result } = renderHook(() => useCoolDown(clock.now));

      act(() => {
        result.current.start(5);
      });
      act(() => {
        result.current.start(60);
      });
      expect(result.current.secondsLeft).toBe(60);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a nonsense window rather than arming a countdown to nowhere', () => {
    const { result } = renderHook(() => useCoolDown(() => 0));

    act(() => {
      result.current.start(0);
      result.current.start(-1);
      result.current.start(Number.NaN);
      result.current.start(Number.POSITIVE_INFINITY);
    });
    expect(result.current.active).toBe(false);
  });

  it('leaves no interval running once it reaches zero, or after unmount', () => {
    jest.useFakeTimers();
    try {
      const clock = fakeClock();
      const { result, unmount } = renderHook(() => useCoolDown(clock.now));

      act(() => {
        result.current.start(2);
      });
      expect(jest.getTimerCount()).toBe(1);

      act(() => {
        clock.advance(2000);
        jest.advanceTimersByTime(2000);
      });
      // Nothing left to count, so nothing left ticking.
      expect(jest.getTimerCount()).toBe(0);

      act(() => {
        result.current.start(900);
      });
      expect(jest.getTimerCount()).toBe(1);

      // A 15-minute timer that outlives the screen is a `setState` on an
      // unmounted tree and a wake every second for a quarter of an hour.
      unmount();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
