// Render tests for `DurationBadge`.
//
// One node, one caller-supplied sentence, children silent. The failure this
// guards is not cosmetic: "45" and "წთ" read separately give a spelled-out
// numeral followed by a spelled-out abbreviation, on every class card on the
// home screen.

import { render, screen } from '@testing-library/react-native';

import { DurationBadge } from './duration-badge';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('DurationBadge', () => {
  it('is one node carrying the caller’s sentence', () => {
    render(<DurationBadge value="45" unit="წთ" accessibilityLabel="45 წუთი" testID="d" />);
    const node = screen.getByTestId('d');

    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('text');
    expect(node.props.accessibilityLabel).toBe('45 წუთი');
  });

  it('hides the glyphs it draws', () => {
    render(<DurationBadge value="45" unit="წთ" accessibilityLabel="45 წუთი" testID="d" />);
    expect(screen.queryByText('45')).toBeNull();
    expect(screen.queryByText('წთ')).toBeNull();
    expect(screen.getByText('45', HIDDEN)).toBeTruthy();
    expect(screen.getByText('წთ', HIDDEN)).toBeTruthy();
  });

  it('is a 64pt circle', () => {
    render(<DurationBadge value="60" unit="წთ" accessibilityLabel="60 წუთი" testID="d" />);
    const style = flatten(screen.getByTestId('d').props.style);

    expect(style.width).toBe(64);
    expect(style.height).toBe(64);
    // Clamped to half the side by `clampRadiusTo`, because RN will happily
    // render an over-large radius where CSS would scale it down.
    expect(style.borderRadius).toBe(32);
  });

  it('does not uppercase the caller’s unit', () => {
    // The only 10px role is small-caps. Left alone it would render an English
    // "min" as "MIN" — this component transforming copy it was handed.
    render(<DurationBadge value="45" unit="min" accessibilityLabel="45 minutes" testID="d" />);
    const style = flatten(screen.getByText('min', HIDDEN).props.style);

    expect(style.fontSize).toBe(10);
    expect(style.textTransform).toBe('none');
    expect(style.letterSpacing).toBe(0);
  });
});
