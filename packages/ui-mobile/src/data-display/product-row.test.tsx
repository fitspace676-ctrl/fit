// Render tests for `ProductRow`.
//
// Three layouts, and the geometry of each is the thing that drifts: 72pt
// thumbnail on the shop, 56pt in the cart, none at all on the home rail. Plus
// the two rules that are invisible in a screenshot — that the price is spoken
// as a quantity rather than spelled, and that the row does not nest a button
// inside a button once it is given a `trailing` control.

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { ProductRow } from './product-row';

const HIDDEN = { includeHiddenElements: true } as const;

const BASE = {
  name: 'Whey Protein 1kg',
  price: '89,00 ₾',
  priceAccessibilityLabel: '89 ლარი',
} as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

/** The one square child of the given side, i.e. the monogram plate. */
function plateOf(testID: string, side: number) {
  return screen
    .getByTestId(testID)
    .findAll((n) => flatten((n.props as { style?: unknown }).style).width === side)[0];
}

describe('ProductRow layouts', () => {
  it('compact: a shelled row, no thumbnail, an inline lime price and a chevron', () => {
    render(<ProductRow {...BASE} layout="compact" meta="2 ვარიანტი" initial="W" testID="p" />);
    const style = flatten(screen.getByTestId('p').props.style);

    expect(style.borderRadius).toBe(22);
    expect(style.paddingHorizontal).toBe(16);
    expect(style.paddingVertical).toBe(14);
    // No plate at either of the two thumbnail sizes, even though `initial`
    // was supplied — the home rail draws none.
    expect(plateOf('p', 72)).toBeUndefined();
    expect(plateOf('p', 56)).toBeUndefined();

    expect(flatten(screen.getByText('89,00 ₾', HIDDEN).props.style).fontSize).toBe(13);
  });

  it('catalogue: a 72pt monogram plate at radius 22 and a mono 15 price', () => {
    render(<ProductRow {...BASE} layout="catalogue" meta="2 ვარიანტი" initial="W" testID="p" />);
    const style = flatten(screen.getByTestId('p').props.style);

    expect(style.borderRadius).toBe(26);
    expect(style.padding).toBeUndefined();
    expect(style.paddingHorizontal).toBe(16);

    const plate = flatten(plateOf('p', 72)?.props.style);
    expect(plate.height).toBe(72);
    expect(plate.borderRadius).toBe(22);

    // A monogram, never a photo. Mono 30 at 80%, as the artboard draws it.
    const monogram = flatten(screen.getByText('W', HIDDEN).props.style);
    expect(monogram.fontSize).toBe(30);
    expect(monogram.opacity).toBe(0.8);

    expect(flatten(screen.getByText('89,00 ₾', HIDDEN).props.style).fontSize).toBe(15);
  });

  it('line: no shell, a 56pt plate at radius 18, mono 22, quiet price', () => {
    render(<ProductRow {...BASE} layout="line" initial="W" testID="p" />);
    const style = flatten(screen.getByTestId('p').props.style);

    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(style.paddingHorizontal).toBeUndefined();

    const plate = flatten(plateOf('p', 56)?.props.style);
    expect(plate.height).toBe(56);
    expect(plate.borderRadius).toBe(18);

    expect(flatten(screen.getByText('W', HIDDEN).props.style).fontSize).toBe(22);
    // The cart's per-unit figure is quiet mono 12, not the catalogue's lime.
    expect(flatten(screen.getByText('89,00 ₾', HIDDEN).props.style).fontSize).toBe(12);
  });
});

describe('ProductRow behaviour', () => {
  it('speaks the price as a quantity, not as glyphs', () => {
    render(<ProductRow {...BASE} meta="2 ვარიანტი" onPress={jest.fn()} testID="p" />);
    // The row is the node, and the spoken price is the caller's, not "89 comma
    // zero zero lari sign".
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe(
      'Whey Protein 1kg, 2 ვარიანტი, 89 ლარი',
    );
  });

  it('lets the screen say it better', () => {
    render(
      <ProductRow {...BASE} accessibilityLabel="ვეი პროტეინი" onPress={jest.fn()} testID="p" />,
    );
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('ვეი პროტეინი');
  });

  it('makes the WHOLE row the button when there is no trailing control', () => {
    const onPress = jest.fn();
    render(<ProductRow {...BASE} onPress={onPress} testID="p" />);
    const node = screen.getByTestId('p');

    expect(node.props.accessibilityRole).toBe('button');
    expect(flatten(node.props.style).minHeight).toBe(44);
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not nest a button inside a button once there is a trailing control', () => {
    render(
      <ProductRow
        {...BASE}
        layout="catalogue"
        initial="W"
        onPress={jest.fn()}
        trailing={<RNText testID="stepper">−1+</RNText>}
        testID="p"
      />,
    );
    // The ROOT is no longer the button — the leading region is — so the
    // trailing stepper keeps its own, separate accessibility stop.
    expect(screen.getByTestId('p').props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId('stepper')).toBeTruthy();
    expect(screen.getByLabelText('Whey Protein 1kg, 89 ლარი')).toBeTruthy();
  });

  it('announces its own text when it is not pressable at all', () => {
    render(<ProductRow {...BASE} layout="line" initial="W" testID="p" />);
    expect(screen.getByText('Whey Protein 1kg')).toBeTruthy();
    expect(screen.getByLabelText('89 ლარი')).toBeTruthy();
  });
});
