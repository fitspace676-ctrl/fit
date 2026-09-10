// Render tests for `Button`.
//
// The assertions here are about the ONE distinction the component exists to
// carry — `busy` is not `disabled` — plus the two things a button must never
// get wrong (a disabled control that still fires, and a disabled control that
// goes translucent). Nothing here asserts a pixel: a snapshot of a style
// object would lock in today's tokens and fail on every legitimate repaint.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { darkColors } from '../tokens/semantic';

import { Button } from './button';

/**
 * RNTL types a host node's `props` as `any`, so every reach into
 * `accessibilityState` is an unsafe member access the shared lint config
 * (correctly) refuses. Narrow it once, here.
 */
function a11yState(node: unknown): { disabled?: boolean; busy?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Button', () => {
  it('calls onPress, and carries the caller’s label as its accessible name', () => {
    const onPress = jest.fn();
    render(<Button label="დაჯავშნა" onPress={onPress} testID="b" />);

    const node = screen.getByTestId('b');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('დაჯავშნა');

    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // `busy` IS NOT `disabled`. The whole reason both props exist.
  // ==========================================================================
  describe('busy vs disabled', () => {
    it('busy reports { busy: true, disabled: false }', () => {
      render(<Button label="დაჯავშნა" onPress={jest.fn()} busy testID="b" />);
      expect(a11yState(screen.getByTestId('b'))).toEqual({ busy: true, disabled: false });
    });

    it('disabled reports { disabled: true, busy: false }', () => {
      render(<Button label="დაჯავშნა" onPress={jest.fn()} disabled testID="b" />);
      expect(a11yState(screen.getByTestId('b'))).toEqual({ busy: false, disabled: true });
    });

    it('an idle button still reports both keys', () => {
      // A state object that appears only once something is set makes the
      // announcement change shape mid-interaction.
      render(<Button label="დაჯავშნა" onPress={jest.fn()} testID="b" />);
      expect(a11yState(screen.getByTestId('b'))).toEqual({ busy: false, disabled: false });
    });

    it('busy KEEPS the variant’s fill', () => {
      // A primary that greys out the instant it is pressed reads as a
      // rejection rather than as work in progress.
      render(<Button label="დაჯავშნა" onPress={jest.fn()} variant="primary" busy testID="b" />);
      expect(flatten(screen.getByTestId('b').props.style).backgroundColor).toBe(darkColors.accent);
    });

    it('busy swaps the label for the spinner and busyLabel', () => {
      render(<Button label="დაჯავშნა" busyLabel="იგზავნება" onPress={jest.fn()} busy testID="b" />);
      expect(screen.queryByText('დაჯავშნა')).toBeNull();
      expect(screen.getByText('იგზავნება')).toBeTruthy();
      // The `Spinner`'s own progressbar role, announcing the same string.
      expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('იგზავნება');
    });

    it('busyLabel falls back to label rather than to nothing', () => {
      render(<Button label="დაჯავშნა" onPress={jest.fn()} busy testID="b" />);
      expect(screen.getByRole('progressbar').props.accessibilityLabel).toBe('დაჯავშნა');
    });

    it('busy swallows a second press', () => {
      const onPress = jest.fn();
      render(<Button label="დაჯავშნა" onPress={onPress} busy testID="b" />);
      fireEvent.press(screen.getByTestId('b'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  it('disabled blocks onPress', () => {
    const onPress = jest.fn();
    render(<Button label="დაჯავშნა" onPress={onPress} disabled testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disabled keeps the silhouette rather than dimming it', () => {
    // A translucent lime over warm charcoal reads as muddy olive, not as a
    // dimmer lime — so disabled is a FLAT NEUTRAL FILL and never an opacity.
    render(<Button label="დაჯავშნა" onPress={jest.fn()} variant="primary" disabled testID="b" />);
    const style = flatten(screen.getByTestId('b').props.style);
    expect(style.opacity).toBeUndefined();
    expect(style.backgroundColor).toBe(darkColors.borderEmphasized);
    expect(style.backgroundColor).not.toBe(darkColors.accent);
  });

  // ==========================================================================
  // The 44pt floor, from outside the component that implements it.
  // ==========================================================================
  it.each([
    ['sm', 29],
    ['md', 44],
    ['lg', 52],
  ] as const)('%s is %ipt tall and still clears 44 with its slop', (size, height) => {
    render(<Button label="x" onPress={jest.fn()} size={size} testID="b" />);
    const node = screen.getByTestId('b');
    const style = flatten(node.props.style);
    const slop = (node.props.hitSlop ?? { top: 0, bottom: 0 }) as { top: number; bottom: number };

    expect(style.height).toBe(height);
    expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
  });

  it('sm takes the smaller rung, so it cannot become a capsule', () => {
    // `clampRadiusTo('element', 29)` is min(14, 14) = 14 — a full capsule on a
    // 29pt box, and the octagonal silhouette is gone. `inner` (10) is CUT_SM.
    render(<Button label="x" onPress={jest.fn()} size="sm" testID="b" />);
    expect(flatten(screen.getByTestId('b').props.style).borderRadius).toBe(10);
  });

  it('renders every variant without throwing, and none of them dims', () => {
    for (const variant of [
      'primary',
      'secondary',
      'ghost',
      'destructive',
      'onAccent',
      'onAccentQuiet',
    ] as const) {
      const view = render(<Button label="x" onPress={jest.fn()} variant={variant} testID="b" />);
      expect(flatten(view.getByTestId('b').props.style).opacity).toBeUndefined();
      view.unmount();
    }
  });
});

// ===========================================================================
// WCAG 1.4.11 ON THE ONE VARIANT THAT SITS ON LIME.
//
// `onAccentQuiet` is a 10% ink wash on brand-300 — 1.23:1, which is not a
// boundary, it is a slightly darker patch of lime. On the Membership card that
// button is the card's only action. The criterion asks 3:1 for a control's
// boundary, so the boundary is what gets the contrast: a 1pt edge at 55% ink,
// which measures 3.89:1, rather than a 48% fill that would be a different
// button.
// ===========================================================================
describe('Button — the lime-card variant’s edge', () => {
  it('draws a boundary the lime cannot swallow', () => {
    render(<Button variant="onAccentQuiet" label="გაყინვა" onPress={jest.fn()} testID="b" />);
    const style = flatten(screen.getByTestId('b').props.style);
    expect(style.backgroundColor).toBe('rgba(19, 19, 18, 0.10)');
    expect(style.borderColor).toBe('rgba(19, 19, 18, 0.55)');
    expect(style.borderWidth).toBe(1);
  });

  it('drops the edge when disabled — the neutral plate has its own', () => {
    render(
      <Button variant="onAccentQuiet" label="გაყინვა" disabled onPress={jest.fn()} testID="b" />,
    );
    expect(flatten(screen.getByTestId('b').props.style).borderWidth).toBeUndefined();
  });

  it('leaves every other variant unbordered', () => {
    render(<Button variant="primary" label="დაჯავშნა" onPress={jest.fn()} testID="b" />);
    expect(flatten(screen.getByTestId('b').props.style).borderWidth).toBeUndefined();
  });
});
