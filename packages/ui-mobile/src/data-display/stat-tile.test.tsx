// Render tests for `StatTile`.
//
// The assertion that matters here is the SINGLE NODE. Split into two `<Text>`
// nodes — which is what the artboard's markup literally is — VoiceOver reads
// "one eight" and then, as an unrelated stop, "day streak": the number spelled
// digit by digit because it is a tabular monospace run, and the caption
// detached from the number it captions. That failure is invisible in a
// screenshot and in every test that queries by text, so it is asserted here.

import { render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { StatTile } from './stat-tile';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('StatTile', () => {
  // ==========================================================================
  // ONE NODE, ONE COMPOSED LABEL.
  // ==========================================================================
  it('announces the caption and the figure as one node', () => {
    render(<StatTile label="დღის სერია" value="18" testID="s" />);
    const node = screen.getByTestId('s');

    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('text');
    expect(node.props.accessibilityLabel).toBe('დღის სერია: 18');
  });

  it('folds the suffix into the spoken label', () => {
    render(<StatTile label="PT კრედიტი" value="2" suffix="/3" testID="s" />);
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('PT კრედიტი: 2/3');
  });

  it('lets the screen say it better', () => {
    render(
      <StatTile label="დღის სერია" value="18" accessibilityLabel="18 დღიანი სერია" testID="s" />,
    );
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('18 დღიანი სერია');
  });

  it('keeps every child out of the accessibility tree', () => {
    render(<StatTile label="სულ ვიზიტი" value="24" suffix="/30" testID="s" />);
    // Nothing inside announces on its own: the queries that skip hidden
    // elements find no text at all.
    expect(screen.queryByText('24')).toBeNull();
    expect(screen.queryByText('სულ ვიზიტი')).toBeNull();
    // …but the glyphs are on screen.
    expect(screen.getByText('სულ ვიზიტი', HIDDEN)).toBeTruthy();
  });

  // ==========================================================================
  // THE LABEL'S POSITION IS A PROP, BECAUSE THE ARTBOARDS DISAGREE.
  // ==========================================================================
  // Read in TREE ORDER, which is reading order and screen-reader order alike.
  // The caption is 10 or 11pt and the figure 22-30, so the first node's
  // `fontSize` says which of the two came first without matching on copy.
  const firstFontSize = (
    variant: 'default' | 'compact' | 'mini',
    labelPosition?: 'above' | 'below',
  ) => {
    const view = render(
      <StatTile
        label="L"
        value="9"
        variant={variant}
        {...(labelPosition ? { labelPosition } : {})}
        testID="s"
      />,
    );
    const first = view.UNSAFE_getAllByType(RNText)[0];
    const size = flatten(first?.props.style).fontSize;
    view.unmount();
    return size;
  };

  it('puts the caption above the figure by default, below on compact and mini', () => {
    expect(firstFontSize('default')).toBe(11);
    expect(firstFontSize('compact')).toBe(28);
    expect(firstFontSize('mini')).toBe(22);
  });

  it('takes an explicit position over the variant default', () => {
    expect(firstFontSize('compact', 'above')).toBe(10);
    expect(firstFontSize('default', 'below')).toBe(30);
  });

  // ==========================================================================
  // GEOMETRY. Lifted from the artboards, so a repaint that changes it is a
  // decision somebody has to make on purpose.
  // ==========================================================================
  it('draws the artboard shells, and no shell at all on mini', () => {
    const radiusOf = (variant: 'default' | 'compact' | 'mini') => {
      const view = render(<StatTile label="L" value="9" variant={variant} testID="s" />);
      const style = flatten(view.getByTestId('s').props.style);
      view.unmount();
      return style;
    };

    expect(radiusOf('default').borderRadius).toBe(26);
    expect(radiusOf('default').padding).toBe(16);
    expect(radiusOf('compact').borderRadius).toBe(22);
    expect(radiusOf('mini').borderRadius).toBeUndefined();
    expect(radiusOf('mini').padding).toBeUndefined();
    // `mini` is right-aligned inside the QR pass's member strip.
    expect(radiusOf('mini').alignItems).toBe('flex-end');
  });

  it('sets the mono value at the size the artboard draws', () => {
    const sizeOf = (variant: 'default' | 'compact' | 'mini') => {
      const view = render(<StatTile label="L" value="9" variant={variant} testID="s" />);
      const node = view.getByText('9', HIDDEN);
      const style = flatten(node.props.style);
      view.unmount();
      return style;
    };

    expect(sizeOf('default').fontSize).toBe(30);
    expect(sizeOf('compact').fontSize).toBe(28);
    expect(sizeOf('mini').fontSize).toBe(22);
    // `leading-none`: a numeral-only run, so the tight leading is safe.
    expect(sizeOf('mini').lineHeight).toBe(22);
    // The role still supplies the tabular figures — three of these sit in a
    // row on the profile screen and must align.
    expect(sizeOf('compact').fontVariant).toEqual(['tabular-nums']);
  });

  it('renders the trailing adornment', () => {
    render(
      <StatTile
        label="PT კრედიტი"
        value="2"
        suffix="/3"
        trailing={<RNText testID="pips">•••</RNText>}
        testID="s"
      />,
    );
    expect(screen.getByTestId('pips', HIDDEN)).toBeTruthy();
  });
});
