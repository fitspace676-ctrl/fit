// Render tests for `ListRow`.
//
// The `danger` variant is the one that must not drift. It is the sign-out row,
// it is the only red thing on the profile screen, and its colours are the one
// place this component departs from the artboard on purpose (`errorMuted`
// rather than a literal `danger-500/15` — see the note in the component).

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text as RNText } from 'react-native';

import { themeColors } from '../tokens/semantic';

import { ListRow } from './list-row';

const HIDDEN = { includeHiddenElements: true } as const;
const dark = themeColors(true);

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

describe('ListRow', () => {
  it('is a labelled button when it has an onPress', () => {
    const onPress = jest.fn();
    render(
      <ListRow title="ბილინგი" hint="PT კრედიტები" icon="card" onPress={onPress} testID="r" />,
    );
    const node = screen.getByTestId('r');

    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('ბილინგი');
    expect(node.props.accessibilityHint).toBe('PT კრედიტები');
    expect(node.props.accessibilityState).toEqual({ disabled: false });

    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not a button without one — it announces as text and draws no chevron', () => {
    render(<ListRow title="v1.4.0" testID="r" />);
    const node = screen.getByTestId('r');

    expect(node.props.accessibilityRole).toBeUndefined();
    expect(node.props.onClick).toBeUndefined();
    // …and its text is reachable, because nothing above it is speaking for it.
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });

  it('clears the 44pt floor on padding alone', () => {
    render(<ListRow title="ენა" icon="globe" onPress={jest.fn()} testID="r" />);
    const style = flatten(screen.getByTestId('r').props.style);

    // 40pt plate + 2 × 14pt padding. No hit slop, deliberately: slop on rows
    // that stack against one another blurs the boundary between two settings.
    expect(style.minHeight).toBe(68);
    expect(style.paddingHorizontal).toBe(16);
    expect(style.paddingVertical).toBe(14);
    // The row draws NO radius and NO border: the `Surface` that groups them
    // owns the corners, and the `Divider`s own the separation.
    expect(style.borderRadius).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });

  // ==========================================================================
  // THE `danger` VARIANT.
  // ==========================================================================
  it('flips the plate and the title to the red pair', () => {
    render(<ListRow title="გასვლა" icon="logout" danger onPress={jest.fn()} testID="r" />);

    const title = screen.getByText('გასვლა', HIDDEN);
    expect(flatten(title.props.style).color).toBe(dark.error);
    // `error` in dark IS `danger-400` — the artboard's `text-danger-400`.
    expect(dark.error).toBe('#F97066');

    // The plate is the one 40pt-square child in the row.
    const plate = screen
      .getByTestId('r')
      .findAll((n) => flatten((n.props as { style?: unknown }).style).width === 40)[0];
    // `errorMuted` is `danger-950`, which is what `design-system.tsx:372` draws
    // for this same row. The artboard's `bg-danger-500/15` is a literal with no
    // light-mode arm; see the note in `list-row.tsx`.
    expect(flatten(plate?.props.style).backgroundColor).toBe(dark.errorMuted);
  });

  it('leaves a neutral row neutral', () => {
    render(<ListRow title="ბილინგი" icon="card" onPress={jest.fn()} testID="r" />);
    const title = screen.getByText('ბილინგი', HIDDEN);
    expect(flatten(title.props.style).color).toBe(dark.textPrimary);
  });

  it('is silent inside itself when it is a button, and audible when it is not', () => {
    const pressable = render(<ListRow title="ბილინგი" onPress={jest.fn()} testID="r" />);
    expect(pressable.queryByText('ბილინგი')).toBeNull();
    pressable.unmount();

    const plain = render(<ListRow title="ბილინგი" testID="r" />);
    expect(plain.queryByText('ბილინგი')).toBeTruthy();
  });

  it('renders the trailing value and a caller’s trailing node', () => {
    render(
      <ListRow
        title="ენა"
        value="ქართული"
        trailing={<RNText testID="t">·</RNText>}
        onPress={jest.fn()}
        testID="r"
      />,
    );
    expect(screen.getByText('ქართული', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('t', HIDDEN)).toBeTruthy();
  });
});

// ===========================================================================
// THE SUBTITLE THAT WENT MISSING IN GEORGIAN.
//
// Three of the eight Profile menu rows and three of the four
// notification-settings toggles truncated their hint wholesale — each one a
// sentence whose only job is to say what the row does. The row is already 68pt
// against a 44pt floor, so the second line is free.
// ===========================================================================
describe('ListRow — the hint', () => {
  /** RNTL types host props as `any`; narrow the one prop read here. */
  const lines = (node: unknown) =>
    (node as { props?: { numberOfLines?: number } }).props?.numberOfLines;

  it('lets a long hint take a second line', () => {
    render(
      <ListRow
        title="შეტყობინებები"
        hint="მიიღეთ შეხსენებები დაჯავშნილი გაკვეთილების შესახებ"
        testID="r"
      />,
    );
    expect(lines(screen.getByText('მიიღეთ შეხსენებები დაჯავშნილი გაკვეთილების შესახებ'))).toBe(2);
  });

  it('keeps the TITLE at one line — it is the row’s name, not prose', () => {
    render(<ListRow title="შეტყობინებები" hint="x" testID="r" />);
    expect(lines(screen.getByText('შეტყობინებები'))).toBe(1);
  });

  it('still allows one line where a caller needs the rhythm', () => {
    render(<ListRow title="a" hint="bbb" hintLines={1} testID="r" />);
    expect(lines(screen.getByText('bbb'))).toBe(1);
  });
});
