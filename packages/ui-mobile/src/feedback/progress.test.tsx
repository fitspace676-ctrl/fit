// What the progress family owes the DESIGN and the SCREEN READER.
//
// The thresholds themselves are asserted on Vitest in `feedback-metrics.spec.ts`,
// where they belong — arithmetic does not need a renderer. What needs one is
// the wiring: that the clamped value reaches `accessibilityValue.now`, that the
// tone reaches the fill, and that the decorative halves stay out of the a11y
// tree.

import { render, screen } from '@testing-library/react-native';

import { darkColors, lightColors } from '../tokens/semantic';

import { OCCUPANCY_TONE_ROLE, OccupancyMeter, Pips, ProgressBar, ProgressRing } from './progress';

const HIDDEN = { includeHiddenElements: true } as const;

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style))
    return Object.assign({}, ...style.map(flatten)) as Record<string, unknown>;
  if (style && typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

interface A11yValue {
  min?: number;
  max?: number;
  now?: number;
  text?: string;
}

function a11yValue(node: unknown): A11yValue {
  const props = (node as { props?: { accessibilityValue?: A11yValue } }).props;
  return props?.accessibilityValue ?? {};
}

/**
 * The flattened style of a node's `index`-th child.
 *
 * RNTL types `children` as `(ReactTestInstance | string)[]`, so every reach
 * into a fill's style is an assertion. Narrowed once, here.
 */
function childStyle(node: unknown, index = 0): Record<string, unknown> {
  const children = (node as { children?: unknown[] }).children ?? [];
  const child = children[index] as { props?: { style?: unknown } } | undefined;
  return flatten(child?.props?.style);
}

describe('ProgressBar', () => {
  it('announces itself as a progressbar with the caller label', () => {
    render(<ProgressBar value={42} accessibilityLabel="ადგილები" testID="bar" />);
    const node = screen.getByTestId('bar');
    expect(node.props.accessibilityRole).toBe('progressbar');
    expect(node.props.accessibilityLabel).toBe('ადგილები');
  });

  // ==========================================================================
  // THE CLAMP. An `accessibilityValue.now` outside its own range is announced
  // as an over-100% percentage by iOS and dropped outright by Android — and
  // neither shows up on screen, because the BAR is clamped by its own width.
  // ==========================================================================
  it('clamps accessibilityValue.now for -5 and for 140', () => {
    const low = render(<ProgressBar value={-5} accessibilityLabel="a" testID="low" />);
    expect(a11yValue(low.getByTestId('low')).now).toBe(0);
    low.unmount();

    const high = render(<ProgressBar value={140} accessibilityLabel="a" testID="high" />);
    expect(a11yValue(high.getByTestId('high')).now).toBe(100);
  });

  it('reports the range it was given', () => {
    render(<ProgressBar value={2} min={0} max={3} accessibilityLabel="a" testID="bar" />);
    const value = a11yValue(screen.getByTestId('bar'));
    expect(value.min).toBe(0);
    expect(value.max).toBe(3);
    expect(value.now).toBe(2);
  });

  it('speaks the caller text instead of a bare percentage when given one', () => {
    render(
      <ProgressBar
        value={70}
        accessibilityLabel="ადგილები"
        accessibilityValueText="14 / 20"
        testID="bar"
      />,
    );
    expect(a11yValue(screen.getByTestId('bar')).text).toBe('14 / 20');
  });

  it('never paints a NaN width, whatever it is handed', () => {
    render(<ProgressBar value={Number.NaN} accessibilityLabel="a" testID="bar" />);
    expect(childStyle(screen.getByTestId('bar', HIDDEN)).width).toBe('0%');
  });

  it('draws the artboards 8pt track, not the gallerys 4pt one', () => {
    render(<ProgressBar value={50} accessibilityLabel="a" testID="bar" />);
    expect(flatten(screen.getByTestId('bar').props.style).height).toBe(8);
  });

  it('takes the on-lime track as a literal wash, not as a role', () => {
    render(<ProgressBar value={73} tone="onAccent" accessibilityLabel="a" testID="bar" />);
    const style = flatten(screen.getByTestId('bar').props.style);
    expect(style.backgroundColor).toBe('rgba(19, 19, 18, 0.15)');
    expect(childStyle(screen.getByTestId('bar', HIDDEN)).backgroundColor).toBe(darkColors.onAccent);
  });
});

describe('OccupancyMeter', () => {
  /** The fill is the bar's only child. */
  function fillColour(testID: string): unknown {
    return childStyle(screen.getByTestId(testID, HIDDEN)).backgroundColor;
  }

  it('is lime below the tight threshold', () => {
    render(<OccupancyMeter booked={14} capacity={20} accessibilityLabel="a" testID="m" />);
    expect(fillColour('m')).toBe(darkColors.accent);
  });

  it('goes neutral above it', () => {
    render(<OccupancyMeter booked={19} capacity={20} accessibilityLabel="a" testID="m" />);
    expect(fillColour('m')).toBe(darkColors.iconSecondary);
  });

  it('goes red when full', () => {
    render(<OccupancyMeter booked={14} capacity={14} accessibilityLabel="a" testID="m" />);
    expect(fillColour('m')).toBe(darkColors.error);
  });

  it('survives a zero capacity without rendering a NaN', () => {
    render(<OccupancyMeter booked={0} capacity={0} accessibilityLabel="a" testID="m" />);
    expect(childStyle(screen.getByTestId('m', HIDDEN)).width).toBe('0%');
    expect(a11yValue(screen.getByTestId('m')).now).toBe(0);
  });
});

describe('ProgressRing', () => {
  it('announces the clamped value and renders at the artboards 56pt', () => {
    render(<ProgressRing value={140} accessibilityLabel="პერიოდი" testID="ring" />);
    const node = screen.getByTestId('ring');
    expect(node.props.accessibilityRole).toBe('progressbar');
    expect(a11yValue(node).now).toBe(100);
    const style = flatten(node.props.style);
    expect(style.width).toBe(56);
    expect(style.height).toBe(56);
  });

  it('draws the centred figure as real text, and keeps it out of the a11y tree', () => {
    render(<ProgressRing value={73} accessibilityLabel="პერიოდი" testID="ring" />);
    // Only findable with hidden elements included — which IS the assertion:
    // the ring already announces `now`, so a screen reader that also read the
    // glyphs would say "73 percent" twice.
    expect(screen.getByText('73%', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('73%')).toBeNull();
  });

  it('can be drawn without the figure', () => {
    render(<ProgressRing value={73} showValue={false} accessibilityLabel="a" testID="ring" />);
    expect(screen.queryByText('73%', HIDDEN)).toBeNull();
  });
});

describe('Pips', () => {
  it('announces a count, not a percentage', () => {
    render(<Pips filled={2} accessibilityLabel="PT კრედიტი" testID="pips" />);
    const value = a11yValue(screen.getByTestId('pips'));
    expect(value.min).toBe(0);
    expect(value.max).toBe(3);
    expect(value.now).toBe(2);
  });

  it('draws one segment per unit of total', () => {
    render(<Pips filled={1} total={5} accessibilityLabel="a" testID="pips" />);
    expect(screen.getByTestId('pips', HIDDEN).children).toHaveLength(5);
  });

  it('lights exactly the filled segments', () => {
    render(<Pips filled={2} accessibilityLabel="a" testID="pips" />);
    const pips = screen.getByTestId('pips', HIDDEN);
    const colours = [0, 1, 2].map((index) => childStyle(pips, index).backgroundColor);
    expect(colours).toEqual([
      darkColors.textPrimary,
      darkColors.textPrimary,
      darkColors.borderEmphasized,
    ]);
  });

  it('clamps a filled count outside its own total', () => {
    render(<Pips filled={9} total={3} accessibilityLabel="a" testID="pips" />);
    expect(a11yValue(screen.getByTestId('pips')).now).toBe(3);
  });
});

describe('OCCUPANCY_TONE_ROLE', () => {
  // Not a renderer test, but it belongs beside the map it guards.
  function contrast(a: string, b: string): number {
    const channel = (hex: string, at: number) => {
      const v = parseInt(hex.slice(at, at + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string) =>
      0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  it('spends the lime as INK, so the line survives a light card', () => {
    // `accent` is the block lime — the same brand-300 in both maps, because the
    // membership card does not change colour with the theme. As text on a white
    // card that is 1.22:1, which is what "6 spots left" was in light mode.
    expect(OCCUPANCY_TONE_ROLE.accent).toBe('textAccent');
    expect(contrast(lightColors.textAccent, lightColors.backgroundCard)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('is the same pixel value it always was in dark', () => {
    // The fix is invisible in the mode the app ships by default: `textAccent`
    // and `accent` are both brand-300 there.
    expect(darkColors.textAccent).toBe(darkColors.accent);
  });

  it('keeps the other two tones readable on a light card too', () => {
    for (const role of [OCCUPANCY_TONE_ROLE.ink, OCCUPANCY_TONE_ROLE.danger]) {
      expect(contrast(lightColors[role], lightColors.backgroundCard)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
