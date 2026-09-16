// Render tests for `DayCell`.
//
// Two things here are information with no text attached: the SELECTED state
// and the DOT. Neither is visible to a screen reader unless the component puts
// it there — the selection through `accessibilityState`, the dot's meaning
// through the caller's `accessibilityLabel`, which is why that prop is
// required rather than derived from "ხუთ" and "6".

import { fireEvent, render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';

import { DayCell } from './day-cell';

const HIDDEN = { includeHiddenElements: true } as const;
const dark = themeColors(true);

const BASE = { weekday: 'ხუთ', date: '6', accessibilityLabel: 'ხუთშაბათი 6, 4 გაკვეთილი' } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('DayCell', () => {
  it('reports its selection through accessibilityState', () => {
    render(<DayCell {...BASE} selected onPress={jest.fn()} testID="d" />);
    const node = screen.getByTestId('d');

    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('ხუთშაბათი 6, 4 გაკვეთილი');
    expect(node.props.accessibilityState).toEqual({ disabled: false, selected: true });
  });

  it('says so when it is NOT selected, rather than saying nothing', () => {
    render(<DayCell {...BASE} onPress={jest.fn()} testID="d" />);
    // Always emitted: a state object that appears only once something is
    // selected makes the announcement change shape mid-interaction.
    expect(screen.getByTestId('d').props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });
  });

  it('presses', () => {
    const onPress = jest.fn();
    render(<DayCell {...BASE} onPress={onPress} testID="d" />);
    fireEvent.press(screen.getByTestId('d'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // A DISABLED CELL HAS TO LOOK DISABLED.
  //
  // The classes rail never disables one — every week has a schedule — but the
  // join funnel's start-date strip does, because the gym's `startDatePolicy`
  // bounds what a buyer may pick. Undimmed, an out-of-window day is a cell that
  // looks pressable, does nothing when pressed, and explains nothing.
  // ==========================================================================
  it('dims the weekday and the date when it is disabled', () => {
    const off = render(<DayCell {...BASE} disabled onPress={jest.fn()} testID="d" />);
    expect(flatten(off.getByText('ხუთ', HIDDEN).props.style).color).toBe(dark.textDisabled);
    expect(flatten(off.getByText('6', HIDDEN).props.style).color).toBe(dark.textDisabled);
    expect(off.getByTestId('d').props.accessibilityState).toEqual({
      disabled: true,
      selected: false,
    });
    off.unmount();

    const on = render(<DayCell {...BASE} onPress={jest.fn()} testID="d" />);
    expect(flatten(on.getByText('ხუთ', HIDDEN).props.style).color).toBe(dark.onGhost);
  });

  // ==========================================================================
  // THE DOT.
  // ==========================================================================
  it('paints the dot only when the day has classes', () => {
    const empty = render(<DayCell {...BASE} onPress={jest.fn()} testID="d" />);
    // Present, but transparent. Removing the node would shift the weekday and
    // the date up by 10pt on empty days only, and the strip would jitter as
    // the week changed.
    expect(flatten(empty.getByTestId('d-dot', HIDDEN).props.style).backgroundColor).toBe(
      'transparent',
    );
    empty.unmount();

    const busy = render(<DayCell {...BASE} hasClasses onPress={jest.fn()} testID="d" />);
    expect(flatten(busy.getByTestId('d-dot', HIDDEN).props.style).backgroundColor).toBe(
      dark.textDisabled,
    );
  });

  it('darkens the dot on the selected cell, where ink-600 would vanish', () => {
    render(<DayCell {...BASE} hasClasses selected onPress={jest.fn()} testID="d" />);
    const dot = flatten(screen.getByTestId('d-dot', HIDDEN).props.style);

    expect(dot.backgroundColor).toBe(dark.onAccent);
    expect(dot.width).toBe(6);
    expect(dot.height).toBe(6);
    expect(dot.borderRadius).toBe(3);
  });

  it('is 50 × 76 at radius 22, in the artboard’s two fills', () => {
    const idle = render(<DayCell {...BASE} onPress={jest.fn()} testID="d" />);
    const idleStyle = flatten(idle.getByTestId('d').props.style);
    idle.unmount();

    const active = render(<DayCell {...BASE} selected onPress={jest.fn()} testID="d" />);
    const activeStyle = flatten(active.getByTestId('d').props.style);

    expect(idleStyle.width).toBe(50);
    expect(idleStyle.height).toBe(76);
    expect(idleStyle.borderRadius).toBe(22);
    expect(idleStyle.gap).toBe(4);
    expect(idleStyle.backgroundColor).toBe(dark.backgroundCard);
    expect(activeStyle.backgroundColor).toBe(dark.accent);
  });

  it('does not uppercase the caller’s weekday', () => {
    // The only 11px role is small-caps; left alone an English "Thu" would
    // render as "THU" — this component transforming copy it was handed.
    render(
      <DayCell weekday="Thu" date="6" accessibilityLabel="Thursday 6, 4 classes" testID="d" />,
    );
    const style = flatten(screen.getByText('Thu', HIDDEN).props.style);

    expect(style.fontSize).toBe(11);
    expect(style.textTransform).toBe('none');
    expect(style.letterSpacing).toBe(0);
  });

  it('sets the date in tabular mono at 19', () => {
    render(<DayCell {...BASE} testID="d" />);
    const style = flatten(screen.getByText('6', HIDDEN).props.style);

    expect(style.fontSize).toBe(19);
    expect(style.lineHeight).toBe(19);
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });

  it('announces as text, not as a button, when it has no onPress', () => {
    render(<DayCell {...BASE} testID="d" />);
    const node = screen.getByTestId('d');
    expect(node.props.accessibilityRole).toBe('text');
    expect(node.props.accessibilityLabel).toBe('ხუთშაბათი 6, 4 გაკვეთილი');
  });
});
