// Render tests for `AchievementTile`.
//
// The colour swap is the ONLY difference between earned and locked — no badge,
// no check, no second glyph. So the assertion that matters is that the state
// reaches the accessibility tree at all, and that it arrives as a VALUE rather
// than glued onto the name (a label that changes when the achievement is won
// is a label the user cannot search for).

import { render, screen } from '@testing-library/react-native';

import { themeColors } from '../tokens/semantic';

import { AchievementTile } from './achievement-tile';

const HIDDEN = { includeHiddenElements: true } as const;
const dark = themeColors(true);

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('AchievementTile', () => {
  it('puts the state in the accessibility tree as a value, not in the name', () => {
    render(
      <AchievementTile label="10 ვიზიტი" statusLabel="მიღწეულია" earned icon="medal" testID="a" />,
    );
    const node = screen.getByTestId('a');

    expect(node.props.accessibilityLabel).toBe('10 ვიზიტი');
    expect(node.props.accessibilityValue).toEqual({ text: 'მიღწეულია' });
  });

  it('says a locked one is locked', () => {
    render(<AchievementTile label="50 ვიზიტი" statusLabel="დაბლოკილია" icon="medal" testID="a" />);
    const node = screen.getByTestId('a');

    expect(node.props.accessibilityLabel).toBe('50 ვიზიტი');
    expect(node.props.accessibilityValue).toEqual({ text: 'დაბლოკილია' });
  });

  it('swaps the fills, which is the whole visual difference', () => {
    const earned = render(
      <AchievementTile label="სერია" statusLabel="მიღწეულია" earned icon="flame" testID="a" />,
    );
    const earnedTile = flatten(earned.getByTestId('a').props.style);
    const earnedLabel = flatten(earned.getByText('სერია', HIDDEN).props.style);
    earned.unmount();

    const locked = render(
      <AchievementTile label="სერია" statusLabel="დაბლოკილია" icon="flame" testID="a" />,
    );
    const lockedTile = flatten(locked.getByTestId('a').props.style);
    const lockedLabel = flatten(locked.getByText('სერია', HIDDEN).props.style);

    // `bg-white text-ink-950` → `bg-ink-900 text-ink-*`. Mode-independent on
    // the earned arm, deliberately: see the note in the component.
    expect(earnedTile.backgroundColor).toBe(dark.onDark);
    expect(earnedLabel.color).toBe(dark.onLight);
    expect(lockedTile.backgroundColor).toBe(dark.backgroundCard);
    expect(lockedLabel.color).toBe(dark.textDisabled);
  });

  it('is 112 wide at radius 22 with a 44pt plate', () => {
    render(
      <AchievementTile label="სერია" statusLabel="მიღწეულია" earned icon="flame" testID="a" />,
    );
    const style = flatten(screen.getByTestId('a').props.style);

    expect(style.width).toBe(112);
    expect(style.borderRadius).toBe(22);
    expect(style.padding).toBe(16);
    expect(style.alignItems).toBe('center');

    const plate = screen
      .getByTestId('a')
      .findAll((n) => flatten((n.props as { style?: unknown }).style).width === 44)[0];
    expect(flatten(plate?.props.style).borderRadius).toBe(22);
  });

  it('keeps the label and the glyph out of the tree', () => {
    render(
      <AchievementTile label="სერია" statusLabel="მიღწეულია" earned icon="flame" testID="a" />,
    );
    expect(screen.queryByText('სერია')).toBeNull();
    expect(screen.getByText('სერია', HIDDEN)).toBeTruthy();
  });
});
