// Render tests for `Switch` and `SwitchRow`.
//
// The assertion that matters is the last one: the row toggles when you press
// the LABEL, not only when you press the 48 × 28 track. That is the difference
// between a settings screen that works with a thumb and one that works with a
// mouse, and it is invisible in a screenshot.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';

import { Switch, SwitchRow } from './switch';

function a11yState(node: unknown): { disabled?: boolean; checked?: boolean } {
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return props.accessibilityState ?? {};
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('Switch', () => {
  it('announces as a switch, with its checked state', () => {
    render(<Switch label="Push" checked onChange={jest.fn()} testID="s" />);
    const node = screen.getByTestId('s');
    // `role="switch"` and not `"checkbox"`: a checkbox is announced as "will
    // be applied when you submit", a switch as "is on". These settings save on
    // change, so the switch is the honest one.
    expect(node.props.accessibilityRole).toBe('switch');
    expect(a11yState(node)).toEqual({ checked: true, disabled: false });
  });

  it('reports the caller’s value back, inverted', () => {
    const onChange = jest.fn();
    render(<Switch label="Push" checked={false} onChange={onChange} testID="s" />);
    fireEvent.press(screen.getByTestId('s'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is controlled — it does not flip itself', () => {
    // A switch that moves before the mutation resolves is a switch that lies
    // when the mutation fails.
    const onChange = jest.fn();
    render(<Switch label="Push" checked={false} onChange={onChange} testID="s" />);
    fireEvent.press(screen.getByTestId('s'));
    expect(a11yState(screen.getByTestId('s')).checked).toBe(false);
  });

  it('pays for its own touch target: a 28pt track reaches 44 with slop', () => {
    render(<Switch label="Push" checked onChange={jest.fn()} testID="s" />);
    const node = screen.getByTestId('s');
    const style = flatten(node.props.style);
    const slop = node.props.hitSlop as { top: number; bottom: number; left: number; right: number };

    expect(style.height).toBe(28);
    expect(Number(style.height) + slop.top + slop.bottom).toBe(44);
    expect(Number(style.width) + slop.left + slop.right).toBeGreaterThanOrEqual(44);
  });

  it('does not fire when disabled', () => {
    const onChange = jest.fn();
    render(<Switch label="Push" checked={false} onChange={onChange} disabled testID="s" />);
    fireEvent.press(screen.getByTestId('s'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('SwitchRow', () => {
  // ==========================================================================
  // THE ROW IS THE TARGET.
  // ==========================================================================
  it('toggles from the LABEL, not only from the track', () => {
    const onChange = jest.fn();
    render(
      <SwitchRow
        label="Push შეტყობინებები"
        description="შეხსენებები და შეთავაზებები"
        checked={false}
        onChange={onChange}
      />,
    );

    // Found by its visible text — which is only possible because the label is
    // inside the control and the control is the whole row.
    fireEvent.press(screen.getByText('Push შეტყობინებები'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('announces once, as one switch named by its label', () => {
    render(
      <SwitchRow
        label="Push შეტყობინებები"
        description="შეხსენებები და შეთავაზებები"
        checked
        onChange={jest.fn()}
        testID="row"
      />,
    );

    const node = screen.getByTestId('row');
    expect(node.props.accessibilityRole).toBe('switch');
    expect(node.props.accessibilityLabel).toBe('Push შეტყობინებები');
    // The description rides as a HINT, so the announcement is
    // "name, state, hint" rather than three separate elements.
    expect(node.props.accessibilityHint).toBe('შეხსენებები და შეთავაზებები');
    expect(a11yState(node)).toEqual({ checked: true, disabled: false });

    // Exactly one switch in the tree — the decorative track does not announce
    // itself beside the row that contains it.
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('is tall enough on its own, with no slop to blur the row boundary', () => {
    render(<SwitchRow label="Push" checked onChange={jest.fn()} testID="row" />);
    const node = screen.getByTestId('row');
    expect(Number(flatten(node.props.style).minHeight)).toBeGreaterThanOrEqual(44);
    // Rows stack directly against one another; slop here would extend each
    // row's target into its neighbour's.
    expect(node.props.hitSlop).toBeUndefined();
  });

  it('hideLabel keeps the accessible name and drops the text', () => {
    render(<SwitchRow label="Push" hideLabel checked onChange={jest.fn()} testID="row" />);
    expect(screen.queryByText('Push')).toBeNull();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe('Push');
  });
});

describe('SwitchRow — the description', () => {
  /** RNTL types host props as `any`; narrow the one prop read here. */
  const lines = (node: unknown) =>
    (node as { props?: { numberOfLines?: number } }).props?.numberOfLines;

  // Same defect as `ListRowProps.hint`: three of the four notification-settings
  // toggles lost the sentence that says what the member is turning off.
  it('lets a long description take a second line', () => {
    render(
      <SwitchRow
        label="შეხსენებები"
        description="მიიღეთ შეხსენება დაჯავშნილ გაკვეთილამდე ერთი საათით ადრე"
        checked={false}
        onChange={jest.fn()}
        testID="s"
      />,
    );
    expect(
      lines(screen.getByText('მიიღეთ შეხსენება დაჯავშნილ გაკვეთილამდე ერთი საათით ადრე')),
    ).toBe(2);
  });

  it('still allows one line on request', () => {
    render(
      <SwitchRow
        label="a"
        description="bbb"
        descriptionLines={1}
        checked={false}
        onChange={jest.fn()}
        testID="s"
      />,
    );
    expect(lines(screen.getByText('bbb'))).toBe(1);
  });
});

describe('SwitchRow — a disabled row is still readable', () => {
  const dark = themeColors(true);

  // ==========================================================================
  // `textDisabled` is ink-600: 2.16:1 on the ink-900 card. WCAG exempts
  // disabled controls from 1.4.3, so this was not a conformance failure — it
  // was worse. The notification-settings categories are disabled BY THE MASTER
  // SWITCH, and their descriptions are what the member reads to decide whether
  // to turn that master switch on.
  // ==========================================================================
  it('dims the label but never the sentence that explains it', () => {
    render(
      <SwitchRow
        label="შეხსენებები"
        description="მიიღეთ შეხსენება გაკვეთილამდე"
        checked={false}
        onChange={jest.fn()}
        disabled
        testID="s"
      />,
    );
    expect(flatten(screen.getByText('შეხსენებები').props.style).color).toBe(dark.textDisabled);
    expect(flatten(screen.getByText('მიიღეთ შეხსენება გაკვეთილამდე').props.style).color).toBe(
      dark.textSecondary,
    );
  });
});
