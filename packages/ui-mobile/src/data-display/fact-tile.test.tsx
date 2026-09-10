// Render tests for `FactTile`.
//
// Four of these sit in a 2×2 grid on the class-detail screen. The thing worth
// asserting is that they are four accessibility stops and not eight: left as
// two `<Text>` nodes each, the rotor alternates caption, value, caption, value
// with nothing tying the pairs together.

import { render, screen } from '@testing-library/react-native';

import { FactTile } from './fact-tile';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('FactTile', () => {
  it('announces the caption and the value as one node', () => {
    render(<FactTile label="მწვრთნელი" value="Sandro K." icon="user" testID="f" />);
    const node = screen.getByTestId('f');

    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('text');
    expect(node.props.accessibilityLabel).toBe('მწვრთნელი: Sandro K.');
  });

  it('lets the screen say it better', () => {
    render(
      <FactTile
        label="ხანგრძლივობა"
        value="45 წუთი"
        accessibilityLabel="45 წუთი ხანგრძლივობა"
        testID="f"
      />,
    );
    expect(screen.getByTestId('f').props.accessibilityLabel).toBe('45 წუთი ხანგრძლივობა');
  });

  it('keeps the caption, the value and the glyph out of the accessibility tree', () => {
    render(<FactTile label="ლოკაცია" value="Main Floor" icon="pin" testID="f" />);
    expect(screen.queryByText('ლოკაცია')).toBeNull();
    expect(screen.queryByText('Main Floor')).toBeNull();
    expect(screen.getByText('Main Floor', HIDDEN)).toBeTruthy();
  });

  it('draws the artboard geometry', () => {
    render(<FactTile label="ოთახი" value="ველო-ზონა" icon="users" testID="f" />);
    const style = flatten(screen.getByTestId('f').props.style);

    expect(style.borderRadius).toBe(22);
    expect(style.padding).toBe(16);
  });

  it('sets the value at 15/700 — the size from the scale, the weight from the artboard', () => {
    render(<FactTile label="ოთახი" value="ველო-ზონა" testID="f" />);
    const style = flatten(screen.getByText('ველო-ზონა', HIDDEN).props.style);

    expect(style.fontSize).toBe(15);
    expect(style.fontWeight).toBe('700');
    // Overriding the weight is only safe because the 15px role rides the
    // system sans. If it ever named a bundled face, this would double-bold.
    expect(style.fontFamily).toBeUndefined();
  });

  it('renders without an icon', () => {
    render(<FactTile label="ოთახი" value="ველო-ზონა" testID="f" />);
    expect(screen.getByTestId('f')).toBeTruthy();
  });
});
