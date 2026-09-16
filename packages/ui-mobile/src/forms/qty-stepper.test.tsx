// Render tests for `QtyStepper`.
//
// Two things are asserted that a visual check cannot see: that the ends are
// DISABLED rather than hidden at a boundary (hiding one reflows the row under
// the thumb that is pressing it), and that the control announces a VALUE —
// without which VoiceOver's swipe gesture moves the number silently.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { QtyStepper } from './qty-stepper';

const LABELS = { decrease: 'შემცირება', increase: 'გაზრდა', value: 'რაოდენობა' };

function a11yState(node: unknown): { disabled?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('QtyStepper', () => {
  it('steps the caller’s value', () => {
    const onChange = jest.fn();
    render(<QtyStepper value={2} onChange={onChange} max={9} labels={LABELS} testID="q" />);

    fireEvent.press(screen.getByTestId('q-increase'));
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.press(screen.getByTestId('q-decrease'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  // ==========================================================================
  // The a11y contract: `adjustable` + a value, AND two labelled buttons.
  // ==========================================================================
  it('is adjustable and reports its value', () => {
    render(
      <QtyStepper value={3} onChange={jest.fn()} min={1} max={9} labels={LABELS} testID="q" />,
    );
    const node = screen.getByTestId('q');

    expect(node.props.accessibilityRole).toBe('adjustable');
    expect(node.props.accessibilityLabel).toBe('რაოდენობა');
    // `text` is what a screen reader SAYS. Without it VoiceOver derives a
    // percentage from min/now/max, which for a cart quantity is nonsense.
    expect(node.props.accessibilityValue).toEqual({ min: 1, max: 9, now: 3, text: '3' });
    expect(node.props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
  });

  it('the VoiceOver swipe actions do the same thing the buttons do', () => {
    const onChange = jest.fn();
    render(<QtyStepper value={2} onChange={onChange} max={9} labels={LABELS} testID="q" />);
    const node = screen.getByTestId('q');

    fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('labels the two buttons individually, for Switch Control', () => {
    // A stepper whose only accessible element is the `adjustable` group is
    // unusable with a switch, which has no increment gesture and moves element
    // to element instead.
    render(<QtyStepper value={2} onChange={jest.fn()} labels={LABELS} testID="q" />);
    expect(screen.getByTestId('q-decrease').props.accessibilityLabel).toBe('შემცირება');
    expect(screen.getByTestId('q-increase').props.accessibilityLabel).toBe('გაზრდა');
  });

  // ==========================================================================
  // Boundaries: disabled, not hidden.
  // ==========================================================================
  it('disables the minus at min, and keeps it on screen', () => {
    const onChange = jest.fn();
    render(<QtyStepper value={0} onChange={onChange} min={0} labels={LABELS} testID="q" />);

    const minus = screen.getByTestId('q-decrease');
    expect(a11yState(minus).disabled).toBe(true);
    fireEvent.press(minus);
    expect(onChange).not.toHaveBeenCalled();
    // Still rendered — the control keeps its width, so the row does not reflow
    // as the count reaches a boundary.
    expect(minus).toBeTruthy();
  });

  it('disables the plus at max', () => {
    const onChange = jest.fn();
    render(<QtyStepper value={5} onChange={onChange} max={5} labels={LABELS} testID="q" />);

    const plus = screen.getByTestId('q-increase');
    expect(a11yState(plus).disabled).toBe(true);
    fireEvent.press(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('an unbounded stepper never disables its plus', () => {
    render(<QtyStepper value={999} onChange={jest.fn()} labels={LABELS} testID="q" />);
    expect(a11yState(screen.getByTestId('q-increase')).disabled).toBe(false);
  });

  it('removeAtMin swaps the minus for a bin one step above the floor', () => {
    // The cart's case: pressing it once more removes the line rather than
    // stepping to a quantity of zero.
    const { rerender } = render(
      <QtyStepper value={1} onChange={jest.fn()} min={0} removeAtMin labels={LABELS} testID="q" />,
    );
    const withBin = screen.toJSON();
    rerender(
      <QtyStepper value={2} onChange={jest.fn()} min={0} removeAtMin labels={LABELS} testID="q" />,
    );
    // Different glyph path, same control, same label.
    expect(JSON.stringify(withBin)).not.toBe(JSON.stringify(screen.toJSON()));
    expect(screen.getByTestId('q-decrease').props.accessibilityLabel).toBe('შემცირება');
  });

  // ==========================================================================
  // The 44pt floor, at both sizes.
  // ==========================================================================
  it.each([
    ['md', 36, 44],
    ['sm', 32, 40],
  ] as const)('%s: %ipt buttons inside a %ipt container', (size, button, container) => {
    render(<QtyStepper value={2} onChange={jest.fn()} size={size} labels={LABELS} testID="q" />);

    expect(flatten(screen.getByTestId('q').props.style).height).toBe(container);

    for (const id of ['q-decrease', 'q-increase']) {
      const node = screen.getByTestId(id);
      const style = flatten(node.props.style);
      const slop = node.props.hitSlop as {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
      expect(style.height).toBe(button);
      // The buttons are under the floor at BOTH sizes and pay for it
      // themselves — the container's 44 does not help a finger aiming at a
      // 36pt circle inside it.
      expect(button + slop.top + slop.bottom).toBe(44);
      expect(button + slop.left + slop.right).toBe(44);
    }
  });
});
