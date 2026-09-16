// Render tests for `PersonRow`.
//
// The action slot is the point of this file. Both arms have to clear the 44pt
// floor — the icon arm by being 44, the labelled arm by being 36 plus the slop
// the component applies itself — and the row must NOT be a button around a
// button, which would give a screen-reader user two stops that do different
// things and no way to tell them apart.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { MIN_TOUCH_TARGET } from '../internal/hit-slop';
import { themeColors } from '../tokens/semantic';

import { PersonRow } from './person-row';

const HIDDEN = { includeHiddenElements: true } as const;
const dark = themeColors(true);

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function slopOf(node: { props: Record<string, unknown> }) {
  return (node.props.hitSlop ?? { top: 0, bottom: 0, left: 0, right: 0 }) as {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

describe('PersonRow', () => {
  it('draws the artboard shell', () => {
    render(<PersonRow name="Ana G." eyebrow="შენი მწვრთნელი" meta="Yoga Flow" testID="p" />);
    const style = flatten(screen.getByTestId('p').props.style);

    expect(style.borderRadius).toBe(26);
    expect(style.padding).toBe(16);
    expect(style.gap).toBe(12);
    expect(style.backgroundColor).toBe(dark.backgroundCard);
  });

  it('announces its text, because the row itself is not a control', () => {
    render(<PersonRow name="Ana G." eyebrow="შენი მწვრთნელი" meta="Yoga Flow" testID="p" />);

    expect(screen.getByTestId('p').props.accessibilityRole).toBeUndefined();
    // Three ordinary text stops — the name is not swallowed by a button label.
    expect(screen.getByText('Ana G.')).toBeTruthy();
    expect(screen.getByText('შენი მწვრთნელი')).toBeTruthy();
    expect(screen.getByText('Yoga Flow')).toBeTruthy();
  });

  it('sets the name at 16/700 — the artboard’s row title', () => {
    render(<PersonRow name="Ana G." testID="p" />);
    expect(flatten(screen.getByText('Ana G.').props.style).fontSize).toBe(16);
  });

  // ==========================================================================
  // THE ACTION SLOT.
  // ==========================================================================
  it('icon: a labelled 44pt lime button', () => {
    const onPress = jest.fn();
    render(
      <PersonRow
        name="Ana G."
        action={{
          kind: 'icon',
          icon: 'arrow',
          accessibilityLabel: 'სესიის დაჯავშნა',
          onPress,
          testID: 'act',
        }}
        testID="p"
      />,
    );
    const node = screen.getByTestId('act');
    const style = flatten(node.props.style);
    const slop = slopOf(node);

    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('სესიის დაჯავშნა');
    expect(Number(style.height) + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('label: a 36pt plate that reaches 44 on its own slop', () => {
    const onPress = jest.fn();
    render(
      <PersonRow
        name="Sandro K."
        action={{ kind: 'label', label: 'პროფილი', onPress, testID: 'act' }}
        testID="p"
      />,
    );
    const node = screen.getByTestId('act');
    const style = flatten(node.props.style);
    const slop = slopOf(node);

    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('პროფილი');
    expect(style.minHeight).toBe(36);
    // The component applies the slop, never the call site.
    expect(slop.top).toBe(4);
    expect(Number(style.minHeight) + slop.top + slop.bottom).toBeGreaterThanOrEqual(
      MIN_TOUCH_TARGET,
    );
    // `CUT_SM` → the `inner` rung, clamped to half the 36pt plate.
    expect(style.borderRadius).toBe(10);

    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('label: the visible label is the spoken one unless told otherwise', () => {
    render(
      <PersonRow
        name="Sandro K."
        action={{
          kind: 'label',
          label: 'პროფილი',
          accessibilityLabel: 'Sandro K.-ის პროფილი',
          onPress: jest.fn(),
          testID: 'act',
        }}
      />,
    );
    expect(screen.getByTestId('act').props.accessibilityLabel).toBe('Sandro K.-ის პროფილი');
    expect(screen.getByText('პროფილი', HIDDEN)).toBeTruthy();
  });

  it('renders with no action at all', () => {
    render(<PersonRow name="Nino K." testID="p" />);
    expect(screen.getByTestId('p')).toBeTruthy();
  });

  // ==========================================================================
  // THE ROW AS THE CONTROL — the other arm of the union.
  //
  // Class detail's coach row opens the trainer's sheet, and the artboard's
  // 36pt "პროფილი" button inside an 84pt row that does nothing is a small
  // target where a large one was available. The two shapes stay mutually
  // exclusive so the "button inside a button" case is not expressible.
  // ==========================================================================
  it('onPress: one stop, named by the caller, with a hint', () => {
    const onPress = jest.fn();
    render(
      <PersonRow
        name="Sandro K."
        eyebrow="მწვრთნელი"
        onPress={onPress}
        accessibilityLabel="მწვრთნელი: Sandro K."
        accessibilityHint="აჩვენებს მწვრთნელის დეტალებს"
        testID="p"
      />,
    );
    const row = screen.getByTestId('p');

    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('მწვრთნელი: Sandro K.');
    expect(row.props.accessibilityHint).toBe('აჩვენებს მწვრთნელის დეტალებს');

    fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('onPress: the whole row is the target, so it clears 44 without slop', () => {
    render(
      <PersonRow name="Sandro K." onPress={jest.fn()} accessibilityLabel="Sandro K." testID="p" />,
    );
    const style = flatten(screen.getByTestId('p').props.style);

    // 52pt avatar + 2 × 16pt padding. Nothing to hit-slop — the row IS the
    // plate, unlike the 36pt labelled action above.
    expect(Number(style.padding) * 2 + 52).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('onPress: draws the chevron that says it is pressable — and only then', () => {
    const { rerender } = render(
      <PersonRow name="Sandro K." onPress={jest.fn()} accessibilityLabel="Sandro K." testID="p" />,
    );
    expect(screen.UNSAFE_queryAllByProps({ name: 'chevronRight' }).length).toBe(1);

    // `ListRow`'s rule: no `onPress`, no chevron, no promise of a press.
    rerender(<PersonRow name="Sandro K." testID="p" />);
    expect(screen.UNSAFE_queryAllByProps({ name: 'chevronRight' }).length).toBe(0);
    expect(screen.getByTestId('p').props.accessibilityRole).toBeUndefined();
  });
});
