// Render tests for `TextField`.
//
// NO MOBILE ARTBOARD CONTAINS A TEXT INPUT — this control is derived from
// `web-member-login.tsx` — so these tests are the only specification the five
// auth screens will have. They assert the two things that are pure liability
// rather than aesthetics: that the field is NAMED, and that a validation
// failure is announced rather than merely drawn.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { darkColors } from '../tokens/semantic';

import { TextField } from './text-field';

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('TextField', () => {
  it('names the input from the label, and draws the label too', () => {
    render(<TextField label="ელფოსტა" testID="f" />);
    expect(screen.getByTestId('f-input').props.accessibilityLabel).toBe('ელფოსტა');
    expect(screen.getByText('ელფოსტა')).toBeTruthy();
  });

  it('labelHidden keeps the name and drops the text', () => {
    // Not "drops the label" — leaning on a placeholder instead would leave the
    // control unnamed, and the placeholder disappears once there is a value.
    render(<TextField label="ძებნა" labelHidden testID="f" />);
    expect(screen.queryByText('ძებნა')).toBeNull();
    expect(screen.getByTestId('f-input').props.accessibilityLabel).toBe('ძებნა');
  });

  it('is 52pt tall, at the login comp’s CUT_MD radius', () => {
    render(<TextField label="ელფოსტა" testID="f" />);
    const box = flatten(screen.getByTestId('f-box').props.style);
    expect(box.height).toBe(52);
    expect(box.borderRadius).toBe(14);
  });

  // ==========================================================================
  // The error state. A validation failure that is only drawn is a validation
  // failure a screen-reader user cannot find.
  // ==========================================================================
  it('announces the error, politely, as an alert', () => {
    render(<TextField label="ელფოსტა" error="შეავსე ელფოსტა" testID="f" />);
    const message = screen.getByTestId('f-error');

    // Both, because they are different platforms' answers to the same
    // question: `accessibilityLiveRegion` is Android's, `role="alert"` iOS's.
    expect(message.props.accessibilityLiveRegion).toBe('polite');
    expect(message.props.accessibilityRole).toBe('alert');
    expect(screen.getByText('შეავსე ელფოსტა')).toBeTruthy();
  });

  it('an error paints the border and flags the input as invalid', () => {
    render(<TextField label="ელფოსტა" error="შეავსე ელფოსტა" testID="f" />);
    expect(flatten(screen.getByTestId('f-box').props.style).borderColor).toBe(darkColors.error);
    expect(screen.getByTestId('f-input').props['aria-invalid']).toBe(true);
  });

  it('`invalid` paints the border with no message, and `error` replaces the hint', () => {
    const { rerender } = render(<TextField label="ელფოსტა" hint="ჩაწერე ელფოსტა" testID="f" />);
    expect(screen.getByText('ჩაწერე ელფოსტა')).toBeTruthy();
    expect(screen.queryByTestId('f-error')).toBeNull();

    rerender(<TextField label="ელფოსტა" hint="ჩაწერე ელფოსტა" invalid testID="f" />);
    expect(flatten(screen.getByTestId('f-box').props.style).borderColor).toBe(darkColors.error);
    expect(screen.queryByTestId('f-error')).toBeNull();

    rerender(<TextField label="ელფოსტა" hint="ჩაწერე ელფოსტა" error="არასწორია" testID="f" />);
    expect(screen.queryByText('ჩაწერე ელფოსტა')).toBeNull();
    expect(screen.getByText('არასწორია')).toBeTruthy();
  });

  // ==========================================================================
  // Focus.
  // ==========================================================================
  it('takes the lime border and the focus ring on focus, and gives them back', () => {
    render(<TextField label="ელფოსტა" testID="f" />);
    const input = screen.getByTestId('f-input');

    fireEvent(input, 'focus');
    let box = flatten(screen.getByTestId('f-box').props.style);
    expect(box.borderColor).toBe(darkColors.accent);
    // `outlineWidth` sits OUTSIDE the border box, so unlike a thicker border
    // it cannot nudge the text by a point when the field takes focus.
    expect(box.outlineWidth).toBe(3);
    expect(box.outlineColor).toBe(darkColors.focusRing);

    fireEvent(input, 'blur');
    box = flatten(screen.getByTestId('f-box').props.style);
    expect(box.borderColor).toBe(darkColors.border);
    expect(box.outlineWidth).toBeUndefined();
  });

  it('an invalid field stays red on focus rather than turning lime', () => {
    render(<TextField label="ელფოსტა" error="არასწორია" testID="f" />);
    fireEvent(screen.getByTestId('f-input'), 'focus');
    expect(flatten(screen.getByTestId('f-box').props.style).borderColor).toBe(darkColors.error);
  });

  it('chains the caller’s own onFocus / onBlur rather than swallowing them', () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    render(<TextField label="ელფოსტა" onFocus={onFocus} onBlur={onBlur} testID="f" />);

    fireEvent(screen.getByTestId('f-input'), 'focus');
    fireEvent(screen.getByTestId('f-input'), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // The password reveal.
  // ==========================================================================
  it('reveals a password only when the caller supplies both labels', () => {
    render(<TextField label="პაროლი" secureTextEntry testID="f" />);
    // No labels, no toggle — the strings are copy, and copy is the caller's.
    expect(screen.queryByTestId('f-reveal')).toBeNull();
  });

  it('toggles secureTextEntry, relabelling as it goes', () => {
    render(
      <TextField
        label="პაროლი"
        secureTextEntry
        revealLabels={{ show: 'ჩვენება', hide: 'დამალვა' }}
        testID="f"
      />,
    );

    expect(screen.getByTestId('f-input').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('f-reveal').props.accessibilityLabel).toBe('ჩვენება');

    fireEvent.press(screen.getByTestId('f-reveal'));

    expect(screen.getByTestId('f-input').props.secureTextEntry).toBe(false);
    expect(screen.getByTestId('f-reveal').props.accessibilityLabel).toBe('დამალვა');
  });

  it('disabled stops editing without hiding the value', () => {
    render(<TextField label="ელფოსტა" value="a@b.c" disabled testID="f" />);
    expect(screen.getByTestId('f-input').props.editable).toBe(false);
    expect(screen.getByTestId('f-input').props.value).toBe('a@b.c');
  });
});
