// Render tests for `StarRating`.
//
// The assertions here are the ones a screenshot cannot make. Five stars look
// identical whether or not they are named, whether or not the container reports
// a value, and whether or not the swipe gesture works — and all three are the
// difference between a usable control and five silent glyphs.

import { fireEvent, render, screen } from '@testing-library/react-native';

import { StarRating } from './star-rating';

const LABELS = {
  value: 'შენი შეფასება',
  valueText: (rating: number) => `${String(rating)} 5-დან`,
  empty: 'შეფასება ჯერ არ არის არჩეული',
  star: (rating: number) => `${String(rating)} ვარსკვლავი`,
  hint: 'აირჩიე ერთიდან ხუთ ვარსკვლავამდე.',
};

function a11yState(testID: string): Record<string, unknown> {
  const props = screen.getByTestId(testID).props as {
    accessibilityState?: Record<string, unknown>;
  };
  return props.accessibilityState ?? {};
}

describe('StarRating', () => {
  it('reports the rating the member tapped', () => {
    const onChange = jest.fn();
    render(<StarRating value={0} onChange={onChange} labels={LABELS} testID="r" />);

    fireEvent.press(screen.getByTestId('r-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  // ==========================================================================
  // The a11y contract: `adjustable` + a SPOKEN value, and five named buttons.
  // ==========================================================================
  it('is adjustable and speaks its value', () => {
    render(<StarRating value={4} onChange={jest.fn()} labels={LABELS} testID="r" />);
    const node = screen.getByTestId('r');

    expect(node.props.accessibilityRole).toBe('adjustable');
    expect(node.props.accessibilityLabel).toBe('შენი შეფასება');
    expect(node.props.accessibilityHint).toBe('აირჩიე ერთიდან ხუთ ვარსკვლავამდე.');
    // `text` is what a screen reader SAYS. Without it VoiceOver derives a
    // percentage from min/now/max — "80 percent" for four stars.
    expect(node.props.accessibilityValue).toEqual({
      min: 1,
      max: 5,
      now: 4,
      text: '4 5-დან',
    });
    expect(node.props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
  });

  it('says "nothing chosen" rather than a number it does not have', () => {
    render(<StarRating value={0} onChange={jest.fn()} labels={LABELS} testID="r" />);
    // `now` stays inside `[min, max]` — an out-of-range `now` is announced
    // wrong on iOS — and the sentence carries the real state.
    expect(screen.getByTestId('r').props.accessibilityValue).toEqual({
      min: 1,
      max: 5,
      now: 1,
      text: 'შეფასება ჯერ არ არის არჩეული',
    });
  });

  it('names every star individually, for Switch Control', () => {
    // A rating whose only accessible element is the `adjustable` group is
    // unusable with a switch, which has no increment gesture.
    render(<StarRating value={2} onChange={jest.fn()} labels={LABELS} testID="r" />);
    for (const star of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`r-${String(star)}`).props.accessibilityLabel).toBe(
        `${String(star)} ვარსკვლავი`,
      );
    }
  });

  it('announces which stars are chosen, because colour is not reachable', () => {
    render(<StarRating value={3} onChange={jest.fn()} labels={LABELS} testID="r" />);
    expect(a11yState('r-3').selected).toBe(true);
    expect(a11yState('r-4').selected).toBe(false);
  });

  // ==========================================================================
  // The VoiceOver swipe.
  // ==========================================================================
  it('increments and decrements through the accessibility actions', () => {
    const onChange = jest.fn();
    render(<StarRating value={3} onChange={onChange} labels={LABELS} testID="r" />);
    const node = screen.getByTestId('r');

    fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(4);

    fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('clamps at both ends rather than wrapping', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <StarRating value={5} onChange={onChange} labels={LABELS} testID="r" />,
    );
    fireEvent(screen.getByTestId('r'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).not.toHaveBeenCalled();

    rerender(<StarRating value={1} onChange={onChange} labels={LABELS} testID="r" />);
    fireEvent(screen.getByTestId('r'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('an increment from unrated lands on one star, and a decrement does nothing', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <StarRating value={0} onChange={onChange} labels={LABELS} testID="r" />,
    );
    fireEvent(screen.getByTestId('r'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenLastCalledWith(1);

    onChange.mockClear();
    rerender(<StarRating value={0} onChange={onChange} labels={LABELS} testID="r" />);
    // Stepping "down" out of nothing has no meaning, and wrapping to five
    // would set a rating the member never chose.
    fireEvent(screen.getByTestId('r'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Disabled.
  // ==========================================================================
  it('accepts nothing while disabled', () => {
    const onChange = jest.fn();
    render(<StarRating value={2} onChange={onChange} labels={LABELS} disabled testID="r" />);

    fireEvent.press(screen.getByTestId('r-5'));
    fireEvent(screen.getByTestId('r'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(a11yState('r').disabled).toBe(true);
  });
});
