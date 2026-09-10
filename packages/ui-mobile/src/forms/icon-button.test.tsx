// Render tests for `IconButton` — the highest-frequency element in the design
// (~20 instances across 6 of 6 artboards). A bug here is a bug on every screen.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { slopFor, MIN_TOUCH_TARGET } from '../internal/hit-slop';
import { darkColors } from '../tokens/semantic';

import { IconButton, iconButtonRipple, type IconButtonVariant } from './icon-button';

const HIDDEN = { includeHiddenElements: true } as const;

/** The variant table, and the plate size each artboard draws it at. */
const VARIANT_SIZES: [IconButtonVariant, number][] = [
  ['surface', 44],
  ['accent', 44],
  ['quiet', 40],
  ['ghost', 36],
  ['onAccent', 40],
];

/**
 * RNTL types a host node's `props` as `any`, so every reach into
 * `accessibilityState` is an unsafe member access the shared lint config
 * (correctly) refuses. Narrow it once, here, rather than casting at each site.
 */
function a11yState(node: unknown): { disabled?: boolean; selected?: boolean; busy?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('IconButton', () => {
  it('forwards testID to the root node', () => {
    // The smoke suite drives the app entirely by testID. A component that
    // swallows it gets re-implemented locally by whoever needs a selector.
    render(
      <IconButton
        icon="bell"
        accessibilityLabel="Notifications"
        onPress={jest.fn()}
        testID="profile-notifications"
      />,
    );
    expect(screen.getByTestId('profile-notifications')).toBeTruthy();
  });

  it('is a button, carrying the label the caller gave it', () => {
    render(<IconButton icon="bell" accessibilityLabel="შეტყობინებები" onPress={jest.fn()} />);
    const node = screen.getByRole('button');
    expect(node.props.accessibilityLabel).toBe('შეტყობინებები');
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    render(<IconButton icon="bell" accessibilityLabel="a" onPress={onPress} testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // The 44pt floor. THE a11y bug most likely to ship from this component.
  // ==========================================================================
  describe('touch target', () => {
    it.each(VARIANT_SIZES)('%s renders at %ipt and still clears 44', (variant, size) => {
      render(
        <IconButton
          icon="bell"
          accessibilityLabel="a"
          onPress={jest.fn()}
          variant={variant}
          testID="b"
        />,
      );
      const node = screen.getByTestId('b');
      const style = flatten(node.props.style);
      expect(style.width).toBe(size);
      expect(style.height).toBe(size);

      const slop = node.props.hitSlop as { top: number; left: number };
      expect(size + slop.top + slop.top).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(size + slop.left + slop.left).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });

    it('applies the slop for an arbitrary size override too', () => {
      // The shop artboard's qty stepper is an `accent` plate at 36, not 44.
      // The override has to carry the floor with it, or that button ships a
      // 36pt target — which is exactly the class of bug the plan calls out.
      render(
        <IconButton
          icon="plus"
          accessibilityLabel="a"
          onPress={jest.fn()}
          variant="accent"
          size={28}
          testID="b"
        />,
      );
      const node = screen.getByTestId('b');
      expect(flatten(node.props.style).width).toBe(28);
      expect((node.props.hitSlop as { top: number }).top).toBe(slopFor(28));
      expect(28 + 2 * slopFor(28)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });

    it('exposes no hitSlop prop for a call site to get wrong', () => {
      // Deliberately not part of the public props. A prop is a thing a call
      // site can forget; this one is paid by the component, unconditionally.
      const withSlop = (
        <IconButton
          icon="bell"
          accessibilityLabel="a"
          onPress={jest.fn()}
          // @ts-expect-error -- `hitSlop` is not an IconButton prop.
          hitSlop={0}
        />
      );
      expect(withSlop).toBeTruthy();
    });
  });

  // ==========================================================================
  // Toggle state.
  // ==========================================================================
  describe('selected', () => {
    it('reflects in accessibilityState rather than in the label', () => {
      // A control whose label flips between "mute" and "unmute" is a control
      // the user cannot search for.
      render(
        <IconButton
          icon="sun"
          accessibilityLabel="სიკაშკაშე"
          onPress={jest.fn()}
          selected
          testID="b"
        />,
      );
      expect(a11yState(screen.getByTestId('b')).selected).toBe(true);
      expect(screen.getByTestId('b').props.accessibilityLabel).toBe('სიკაშკაშე');
    });

    it('is false, not absent, when the control is a toggle that is off', () => {
      render(
        <IconButton
          icon="sun"
          accessibilityLabel="a"
          onPress={jest.fn()}
          selected={false}
          testID="b"
        />,
      );
      expect(a11yState(screen.getByTestId('b')).selected).toBe(false);
    });

    it('omits `selected` entirely when the control is not a toggle', () => {
      render(<IconButton icon="bell" accessibilityLabel="a" onPress={jest.fn()} testID="b" />);
      expect(a11yState(screen.getByTestId('b')).selected).toBeUndefined();
    });

    it('takes the accent pair on a neutral plate and its inverse on an accented one', () => {
      // The artboards disagree with each other, and both readings are kept:
      // `mobile-classes.tsx` shows an active filter as a lime plate with an ink
      // glyph; `mobile-qr.tsx` shows the active brightness toggle as its
      // inverse — which is the reading that survives on a plate already lime.
      const neutral = render(
        <IconButton
          icon="filter"
          accessibilityLabel="a"
          onPress={jest.fn()}
          variant="surface"
          selected
          testID="n"
        />,
      );
      expect(flatten(neutral.getByTestId('n').props.style).backgroundColor).toBe(darkColors.accent);
      neutral.unmount();

      const accented = render(
        <IconButton
          icon="sun"
          accessibilityLabel="a"
          onPress={jest.fn()}
          variant="accent"
          selected
          testID="a"
        />,
      );
      expect(flatten(accented.getByTestId('a').props.style).backgroundColor).toBe(
        darkColors.onAccent,
      );
    });
  });

  // ==========================================================================
  // Badges.
  // ==========================================================================
  describe('badge', () => {
    it('renders a count', () => {
      render(
        <IconButton
          icon="bag"
          accessibilityLabel="a"
          onPress={jest.fn()}
          badge={{ count: 3 }}
          testID="b"
        />,
      );
      expect(screen.getByText('3', HIDDEN)).toBeTruthy();
    });

    it('caps an overflowing count', () => {
      render(
        <IconButton
          icon="bag"
          accessibilityLabel="a"
          onPress={jest.fn()}
          badge={{ count: 42 }}
          testID="b"
        />,
      );
      expect(screen.getByText('9+', HIDDEN)).toBeTruthy();
    });

    it('renders a dot with no text', () => {
      render(
        <IconButton
          icon="bell"
          accessibilityLabel="a"
          onPress={jest.fn()}
          badge={{ dot: true }}
          testID="b"
        />,
      );
      expect(screen.queryByText('3', HIDDEN)).toBeNull();
    });

    it('does NOT clip its own overflow', () => {
      // The count badge is offset by −2 and escapes the plate. Setting
      // `overflow: 'hidden'` here to "round the corners properly" is the change
      // that silently deletes every badge; the fill is clipped by borderRadius.
      render(
        <IconButton
          icon="bag"
          accessibilityLabel="a"
          onPress={jest.fn()}
          badge={{ count: 3 }}
          testID="b"
        />,
      );
      const style = flatten(screen.getByTestId('b').props.style);
      expect(style.overflow).not.toBe('hidden');
      expect(style.borderRadius).toBe(22);
    });

    it('leaves the count out of the accessibility tree', () => {
      // "3" on its own tells a screen-reader user three of what. The count
      // belongs in the parent's label, which the caller writes.
      render(
        <IconButton
          icon="bag"
          accessibilityLabel="კალათა, 3 ნივთი"
          onPress={jest.fn()}
          badge={{ count: 3 }}
        />,
      );
      expect(screen.queryByText('3')).toBeNull();
      expect(screen.getByRole('button').props.accessibilityLabel).toBe('კალათა, 3 ნივთი');
    });
  });

  // ==========================================================================
  // Android ripple.
  // ==========================================================================
  it('asks for a borderless ripple sized to the circle', () => {
    // Android's default bounded ripple is drawn as the view's RECTANGLE, so a
    // round button flashes a square behind itself on every tap. `radius` has to
    // be given too, or a borderless ripple expands past the control.
    //
    // Asserted on the config rather than on the rendered node: React Native
    // strips `android_ripple` on every platform but Android, and this suite
    // runs under jest-expo's iOS default — so reading it off the host node
    // would find `undefined` and pass by accident the day it was deleted.
    for (const [, size] of VARIANT_SIZES) {
      const ripple = iconButtonRipple(size, '#000');
      expect(ripple.borderless).toBe(true);
      expect(ripple.radius).toBe(size / 2);
    }
  });

  // ==========================================================================
  // Disabled.
  // ==========================================================================
  it('reports disabled to the screen reader and stops firing', () => {
    const onPress = jest.fn();
    render(<IconButton icon="bell" accessibilityLabel="a" onPress={onPress} disabled testID="b" />);
    expect(a11yState(screen.getByTestId('b')).disabled).toBe(true);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // The type contract.
  // ==========================================================================
  it('will not compile without an accessibilityLabel', () => {
    // Package rule 1, enforced by the type system rather than by review.
    // `@ts-expect-error` fails the build if the error is ever absent.
    // @ts-expect-error -- `accessibilityLabel` is required on IconButton.
    const unlabelled = <IconButton icon="bell" onPress={jest.fn()} />;
    expect(unlabelled).toBeTruthy();
  });

  it('lets style and className through, last', () => {
    render(
      <IconButton
        icon="bell"
        accessibilityLabel="a"
        onPress={jest.fn()}
        testID="b"
        className="mr-2"
        style={{ width: 60 }}
      />,
    );
    expect(flatten(screen.getByTestId('b').props.style).width).toBe(60);
  });
});
