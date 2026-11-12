// The toast host.
//
// Three things are worth a test here, and all three are behavioural: that
// calling the hook outside the provider FAILS LOUDLY, that a toast actually
// goes away on its own, and that a second toast replaces the first rather than
// stacking behind it.
//
// The timings are driven by `setTimeout`, never by an animation callback —
// see the header of `toast-provider.tsx`. That is what makes them assertable
// under fake timers at all.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Pressable, Text as RNText } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { darkColors, lightColors } from '../../tokens/semantic';
import { ThemeProvider } from '../../tokens/theme';
import { TOAST_AUTO_HIDE_MS, TOAST_FADE_MS, TOAST_GAP } from '../feedback-metrics';

import { ToastProvider } from './toast-provider';
import { useToast, type ToastVariant } from './use-toast';

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/** A harness that exposes each API method as a pressable. */
function Trigger({ message, variant }: { message: string; variant?: ToastVariant }) {
  const toast = useToast();
  return (
    <>
      <Pressable
        testID="fire"
        onPress={() => {
          if (variant === 'error') toast.error(message);
          else if (variant === 'info') toast.info(message);
          else toast.success(message);
        }}
      >
        <RNText>fire</RNText>
      </Pressable>
      <Pressable
        testID="hide"
        onPress={() => {
          toast.hide();
        }}
      >
        <RNText>hide</RNText>
      </Pressable>
    </>
  );
}

/** Everything past a dismissal — the fade, then the removal. */
function settle(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useToast', () => {
  // ==========================================================================
  // A DEFAULT NO-OP API WOULD BE WORSE THAN A THROW. A screen that calls
  // `toast.success(...)` outside the provider would then see nothing, forever,
  // with no error to chase — and "the success toast never appears" is a bug
  // report that costs an afternoon.
  // ==========================================================================
  it('throws outside a provider', () => {
    function Orphan() {
      useToast();
      return null;
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not throw inside one', () => {
    expect(() =>
      render(
        <ToastProvider>
          <Trigger message="ok" />
        </ToastProvider>,
      ),
    ).not.toThrow();
  });
});

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('renders children when nothing has been shown', () => {
    render(
      <ToastProvider>
        <RNText>screen</RNText>
      </ToastProvider>,
    );
    expect(screen.getByText('screen')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('success() renders the message, then auto-dismisses', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="დაჯავშნილია" />
      </ToastProvider>,
    );

    fireEvent.press(screen.getByTestId('fire'));
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(screen.getByText('დაჯავშნილია')).toBeTruthy();

    // Still up, just before the timer.
    settle(TOAST_AUTO_HIDE_MS - 1);
    expect(screen.queryByTestId('toast')).toBeTruthy();

    settle(1 + TOAST_FADE_MS + 1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('is announced assertively — it is the only feedback for what just happened', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="დაჯავშნილია" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    const pill = screen.getByTestId('toast');
    expect(pill.props.accessibilityRole).toBe('alert');
    expect(pill.props.accessibilityLiveRegion).toBe('assertive');
    expect(pill.props.accessibilityLabel).toBe('დაჯავშნილია');
  });

  it('is tappable to dismiss early', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="დაჯავშნილია" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    fireEvent.press(screen.getByTestId('toast'));
    settle(TOAST_FADE_MS + 1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('hide() dismisses without waiting for the timer', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="დაჯავშნილია" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    fireEvent.press(screen.getByTestId('hide'));
    settle(TOAST_FADE_MS + 1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  // ==========================================================================
  // ONE TOAST AT A TIME. A member who has triggered two things in three
  // seconds needs the SECOND result; the first is already stale. Stacking
  // would need a queue, a per-item timer and an answer for what five at once
  // looks like on a 390pt screen.
  // ==========================================================================
  it('a second toast replaces the first', () => {
    function Two() {
      const toast = useToast();
      return (
        <>
          <Pressable
            testID="one"
            onPress={() => {
              toast.success('პირველი');
            }}
          >
            <RNText>one</RNText>
          </Pressable>
          <Pressable
            testID="two"
            onPress={() => {
              toast.error('მეორე');
            }}
          >
            <RNText>two</RNText>
          </Pressable>
        </>
      );
    }

    render(
      <ToastProvider testID="toast">
        <Two />
      </ToastProvider>,
    );

    fireEvent.press(screen.getByTestId('one'));
    expect(screen.getByText('პირველი')).toBeTruthy();

    fireEvent.press(screen.getByTestId('two'));
    expect(screen.queryByText('პირველი')).toBeNull();
    expect(screen.getByText('მეორე')).toBeTruthy();
    // Exactly one pill, not two stacked.
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
  });

  it('the replacement restarts the clock rather than inheriting it', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="დაჯავშნილია" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    settle(TOAST_AUTO_HIDE_MS - 100);
    fireEvent.press(screen.getByTestId('fire'));
    // The first toast's timer would have fired 100ms from here.
    settle(200);
    expect(screen.queryByTestId('toast')).toBeTruthy();
  });

  // ==========================================================================
  // THE VISUAL, WHICH THE SALVAGED PROVIDER DID NOT HAVE. It filled a
  // full-width rectangle with `palette.success[600]` — a ramp the August
  // repaint RETIRED. The artboard's toast is a lime pill.
  // ==========================================================================
  it('draws the artboards lime pill for success and a red one for error', () => {
    const ok = render(
      <ToastProvider testID="toast">
        <Trigger message="ok" />
      </ToastProvider>,
    );
    fireEvent.press(ok.getByTestId('fire'));
    const okStyle = flatten(ok.getByTestId('toast').props.style);
    expect(okStyle.backgroundColor).toBe(darkColors.accent);
    // A capsule, clamped to half the pill's own height.
    expect(okStyle.borderRadius).toBe(22);
    ok.unmount();

    const bad = render(
      <ToastProvider testID="toast">
        <Trigger message="fail" variant="error" />
      </ToastProvider>,
    );
    fireEvent.press(bad.getByTestId('fire'));
    expect(flatten(bad.getByTestId('toast').props.style).backgroundColor).toBe(darkColors.error);
  });

  it.each([0, 59])(
    'sits below the top safe area (%s pt) and passes through host touches',
    (top) => {
      render(
        <SafeAreaInsetsContext.Provider value={{ top, bottom: 34, left: 0, right: 0 }}>
          <ToastProvider testID="toast">
            <Trigger message="ok" />
          </ToastProvider>
        </SafeAreaInsetsContext.Provider>,
      );
      fireEvent.press(screen.getByTestId('fire'));
      const host = screen.getByTestId('toast-host');
      const style = flatten(host.props.style);
      expect(style.top).toBe(top + TOAST_GAP);
      expect(style.bottom).toBeUndefined();
      // Clip entry/exit at the safe-area boundary, including multiline pills.
      expect(style.overflow).toBe('hidden');
      expect(host.props.pointerEvents).toBe('box-none');
      expect(screen.getByTestId('toast-motion').props.pointerEvents).toBe('box-none');
      fireEvent.press(screen.getByTestId('hide'));
      settle(TOAST_FADE_MS + 1);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('slides a measured pill down from above and back up before removal', async () => {
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    }));
    render(
      <ToastProvider testID="toast">
        <Trigger message="booked" />
      </ToastProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByTestId('fire'));
    fireEvent(screen.getByTestId('toast-motion'), 'layout', {
      nativeEvent: { layout: { height: 88, width: 300, x: 0, y: 0 } },
    });
    const motion = () => flatten(screen.getByTestId('toast-motion').props.style);
    expect(motion().transform).toEqual([{ translateY: -88 }]);
    expect(timing).toHaveBeenLastCalledWith(expect.anything(), {
      toValue: 1,
      duration: TOAST_FADE_MS,
      useNativeDriver: true,
    });
    const progress = timing.mock.calls[0]![0] as Animated.Value;
    act(() => {
      progress.setValue(1);
    });
    expect(motion().transform).toEqual([{ translateY: 0 }]);
    settle(TOAST_AUTO_HIDE_MS);
    expect(timing).toHaveBeenLastCalledWith(progress, {
      toValue: 0,
      duration: TOAST_FADE_MS,
      useNativeDriver: true,
    });
    act(() => {
      progress.setValue(0);
    });
    expect(motion().transform).toEqual([{ translateY: -88 }]);
    settle(TOAST_FADE_MS - 1);
    expect(screen.queryByRole('alert')).toBeTruthy();
    settle(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('skips motion when requested and still auto-dismisses', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    render(
      <ToastProvider testID="toast">
        <Trigger message="booked" />
      </ToastProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByTestId('fire'));
    expect(flatten(screen.getByTestId('toast-motion').props.style).transform).toEqual([
      { translateY: 0 },
    ]);
    expect(timing).not.toHaveBeenCalled();
    settle(TOAST_AUTO_HIDE_MS + 1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(timing).not.toHaveBeenCalled();
  });

  it('honors live reduced-motion changes and unsubscribes on unmount', async () => {
    const listener = jest.spyOn(
      AccessibilityInfo,
      'addEventListener',
    ) as unknown as jest.SpyInstance<
      ReturnType<typeof AccessibilityInfo.addEventListener>,
      [string, (enabled: boolean) => void]
    >;
    listener.mockClear();
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    }));
    const view = render(
      <ToastProvider testID="toast">
        <Trigger message="booked" />
      </ToastProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByTestId('fire'));
    expect(timing).toHaveBeenCalled();
    const index = listener.mock.calls.findIndex(([name]) => name === 'reduceMotionChanged');
    const change = listener.mock.calls[index]![1];
    const subscription = listener.mock.results[index]!.value as { remove: () => void };
    const remove = jest.spyOn(subscription, 'remove');
    act(() => {
      change(true);
    });
    expect(flatten(screen.getByTestId('toast-motion').props.style).transform).toEqual([
      { translateY: 0 },
    ]);
    timing.mockClear();
    fireEvent.press(screen.getByTestId('hide'));
    settle(1);
    expect(timing).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('does not let a pending dismissal remove a replacement toast', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="booked" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    fireEvent.press(screen.getByTestId('hide'));
    fireEvent.press(screen.getByTestId('fire'));
    settle(TOAST_FADE_MS + 1);
    expect(screen.queryByRole('alert')).toBeTruthy();
  });

  it.each(['light', 'dark'] as const)('keeps the success pill readable in %s mode', (scheme) => {
    const colors = scheme === 'light' ? lightColors : darkColors;
    render(
      <ThemeProvider scheme={scheme}>
        <ToastProvider testID="toast">
          <Trigger message="booked" />
        </ToastProvider>
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    expect(flatten(screen.getByTestId('toast').props.style).backgroundColor).toBe(colors.accent);
    expect(flatten(screen.getByText('booked').props.style).color).toBe(colors.onAccent);
  });

  it('clears the 44pt touch target — it is tappable, so it is a control', () => {
    render(
      <ToastProvider testID="toast">
        <Trigger message="ok" />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByTestId('fire'));
    expect(flatten(screen.getByTestId('toast').props.style).minHeight).toBe(44);
  });
});
