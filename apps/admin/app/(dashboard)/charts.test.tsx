import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AnimatedCircularProgressBar,
  AreaChart,
  DualAreaChart,
  Heatmap,
  SeriesSwatch,
  Sparkline,
} from './charts';

describe('DualAreaChart', () => {
  it('labels itself for assistive technology', () => {
    render(
      <DualAreaChart
        data={[
          { label: '2026-08-01', primary: 10, secondary: 2 },
          { label: '2026-08-02', primary: 20, secondary: 0 },
        ]}
        ariaLabel="Sales and refunds"
      />,
    );
    expect(screen.getByRole('img', { name: 'Sales and refunds' })).toBeInTheDocument();
  });

  it('draws one path per series', () => {
    const { container } = render(
      <DualAreaChart
        data={[
          { label: 'a', primary: 10, secondary: 2 },
          { label: 'b', primary: 20, secondary: 4 },
        ]}
      />,
    );
    // Area fill, the glow (the primary again, wider and translucent), then the
    // two strokes on top.
    expect(container.querySelectorAll('path')).toHaveLength(4);
  });

  // Two independently-scaled series would draw a 2 as tall as a 20. Here the
  // series have different own-maxes (primary peaks at 100, secondary at 10) so
  // shared-vs-independent scaling actually produces different output: under a
  // buggy per-series implementation, secondary would ALSO peak at the top,
  // matching primary's y exactly, since it would be scaled against its own max.
  it('scales both series to the shared maximum, not each series to its own', () => {
    const { container } = render(
      <DualAreaChart
        data={[
          { label: 'a', primary: 10, secondary: 10 },
          { label: 'b', primary: 100, secondary: 10 },
        ]}
        height={100}
      />,
    );
    // The two strokes are the LAST two paths in paint order — read them from the
    // end rather than by a fixed index, so adding a layer underneath (the glow
    // did exactly that) does not silently repoint this at the wrong path.
    const paths = [...container.querySelectorAll('path')];
    const primary = paths[paths.length - 2]?.getAttribute('d') ?? '';
    const secondary = paths[paths.length - 1]?.getAttribute('d') ?? '';
    /** The y of the path's final point — the last number in the last pair. */
    const endY = (d: string) => d.match(/,([-\d.]+)\s*$/)?.[1];
    const primaryTopY = endY(primary);
    const secondaryTopY = endY(secondary);
    // Primary hits the shared max (100) and peaks at the top of the frame;
    // secondary tops out at 10 against that same shared max, so it must stay
    // low. Pin the exact secondary y so the test checks the real arithmetic,
    // not just an inequality.
    expect(secondaryTopY).not.toBe(primaryTopY);
    expect(secondaryTopY).toBe('83.6');
  });

  it('renders an empty frame rather than crashing on no data', () => {
    const { container } = render(<DualAreaChart data={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});

describe('AreaChart gaps', () => {
  // The anatomy is area fill, then the glow (the same path, wider and
  // translucent), then the stroke on top. Three paths for one unbroken series.
  it('draws one continuous path when every value is present', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 10 },
          { label: 'b', value: 20 },
          { label: 'c', value: 30 },
        ]}
      />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(3);
    expect(paths[paths.length - 1]?.getAttribute('d')).not.toContain('NaN');
  });

  // A null is "no value here", not zero. Bridging the gap would draw a line
  // through a figure that was never measured.
  it('breaks the stroke into separate segments around a null', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 10 },
          { label: 'b', value: null },
          { label: 'c', value: 30 },
        ]}
      />,
    );
    const paths = container.querySelectorAll('path');
    const stroke = paths[paths.length - 1]?.getAttribute('d') ?? '';
    expect(stroke).not.toContain('NaN');
    // Two moves: one opening each side of the gap.
    expect(stroke.match(/M/g)).toHaveLength(2);
  });

  it('renders an empty frame when every value is null', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: null },
          { label: 'b', value: null },
        ]}
      />,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('renders a single present value at full height when the rest are null', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 100 },
          { label: 'b', value: null },
        ]}
        height={100}
      />,
    );
    const paths = container.querySelectorAll('path');
    const stroke = paths[paths.length - 1]?.getAttribute('d') ?? '';
    // 100 is the max, so it sits at the top of the frame: y = pad = 8.
    expect(stroke).toContain('8.0');
  });
});

/** The gauge's own geometry, mirrored so a change to either side is visible. */
const CIRCUMFERENCE = 2 * Math.PI * 45;

/** The arcs in paint order: the remainder first, the value on top. */
function arcs(container: HTMLElement): SVGCircleElement[] {
  return [...container.querySelectorAll('circle')];
}

describe('AnimatedCircularProgressBar', () => {
  // The value lives in `stroke-dasharray`, not in the path data — that is what
  // lets the browser transition it rather than redraw it.
  it('draws the value as a share of the ring', () => {
    const { container } = render(<AnimatedCircularProgressBar value={25} max={100} />);
    const [, primary] = arcs(container);
    expect(primary?.getAttribute('style')).toContain(`${25 * (CIRCUMFERENCE / 100)}px`);
  });

  it('scales a value against its own max, not against a hundred', () => {
    const { container } = render(<AnimatedCircularProgressBar value={6} max={24} />);
    // 6 of 24 is 25%, the same arc as the case above.
    const [, primary] = arcs(container);
    expect(primary?.getAttribute('style')).toContain(`${25 * (CIRCUMFERENCE / 100)}px`);
  });

  // A round cap on a zero-length dash paints a dot. On an occupancy gauge that
  // dot sits at twelve o'clock reading as one person in an empty gym.
  it('paints nothing at zero, not a dot', () => {
    const { container } = render(<AnimatedCircularProgressBar value={0} max={24} />);
    const circles = arcs(container);
    expect(circles).toHaveLength(1);
    expect(circles[0]?.getAttribute('style')).toContain('var(--color-background-muted)');
  });

  it('draws the remainder as a second arc until the gap eats it', () => {
    const { container } = render(<AnimatedCircularProgressBar value={20} max={100} />);
    expect(arcs(container)).toHaveLength(2);

    const { container: full } = render(<AnimatedCircularProgressBar value={95} max={100} />);
    expect(arcs(full)).toHaveLength(1);
  });

  // An empty gym is 0 of 24, not a division by zero, and a gym over capacity is
  // still a full ring rather than an arc that wraps past twelve o'clock.
  it('clamps to the ring at both ends', () => {
    const { container: empty } = render(<AnimatedCircularProgressBar value={0} max={0} />);
    expect(empty.textContent).toBe('0');

    const { container: over } = render(<AnimatedCircularProgressBar value={30} max={24} />);
    expect(over.textContent).toBe('100');
  });

  it('shows the percent by default and yields the centre to children', () => {
    const { container: bare } = render(<AnimatedCircularProgressBar value={40} max={100} />);
    expect(bare.textContent).toBe('40');

    const { container: custom } = render(
      <AnimatedCircularProgressBar value={40} max={100}>
        <span>6 of 24</span>
      </AnimatedCircularProgressBar>,
    );
    expect(custom.textContent).toBe('6 of 24');
  });

  it('announces itself as one image rather than two bare circles', () => {
    const { container } = render(
      <AnimatedCircularProgressBar value={5} max={24} ariaLabel="In the gym now" />,
    );
    expect(container.querySelector('[role="img"]')).toHaveAttribute('aria-label', 'In the gym now');
  });
});

/** Every y coordinate in a path — data points AND Bézier control points. */
function ys(d: string): number[] {
  return [...d.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
}

// The curve was straight `L` segments and read as a jagged saw. It is now
// monotone cubic — and monotone is the load-bearing half of that word.
describe('AreaChart curve', () => {
  it('draws Béziers rather than straight segments', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 10 },
          { label: 'b', value: 40 },
          { label: 'c', value: 20 },
        ]}
      />,
    );
    const stroke = [...container.querySelectorAll('path')].pop()?.getAttribute('d') ?? '';
    expect(stroke).toContain('C');
    expect(stroke).not.toContain('NaN');
  });

  // The reason for monotone over Catmull-Rom. A V shape is where an unconstrained
  // spline bulges past the trough — on a revenue chart, drawing a dip below the
  // lowest figure anyone actually took. Both control points of the segments
  // either side of the trough must stay within the data's own band.
  it('never overshoots the data on a sharp trough', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 100 },
          { label: 'b', value: 2 },
          { label: 'c', value: 2 },
          { label: 'd', value: 100 },
        ]}
        height={100}
        showMean={false}
      />,
    );
    const stroke = [...container.querySelectorAll('path')].pop()?.getAttribute('d') ?? '';
    // y is inverted: the top of the frame is `pad` (8), the trough is the largest
    // y. 2 of 100 across a 84px band sits at 100 - 8 - 1.68 ≈ 90.3.
    const trough = 100 - 8 - (2 / 100) * (100 - 16);
    for (const y of ys(stroke)) {
      expect(y).toBeLessThanOrEqual(trough + 0.05);
      expect(y).toBeGreaterThanOrEqual(8 - 0.05);
    }
  });
});

describe('Sparkline', () => {
  it('draws a filled curve for a real series', () => {
    const { container } = render(<Sparkline values={[1, 5, 3, 9]} />);
    const paths = container.querySelectorAll('path');
    // Fill + stroke.
    expect(paths).toHaveLength(2);
    expect(paths[1]?.getAttribute('d')).toContain('C');
  });

  // A tile with nothing to show gets no chart, not an empty box with a flat line
  // along the floor — that line reads as a measured zero.
  it.each([
    ['one point', [4]],
    ['every value null', [null, null, null]],
    ['a series flat at zero', [0, 0, 0]],
  ])('renders nothing for %s', (_label, values) => {
    const { container } = render(<Sparkline values={values as (number | null)[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('breaks the stroke around a gap rather than bridging it', () => {
    const { container } = render(<Sparkline values={[4, null, 9]} />);
    const stroke = [...container.querySelectorAll('path')].pop()?.getAttribute('d') ?? '';
    expect(stroke.match(/M/g)).toHaveLength(2);
  });

  // It is decoration for the numeral beside it, and the numeral is already read.
  it('is hidden from assistive technology', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

// The legends had silently drifted from the lines they labelled: the second
// series went orange when the palette was re-validated, while its swatch stayed
// on the pastel teal that had just FAILED the CVD separation check. Both now
// resolve from one table, and this is the test that says so.
describe('SeriesSwatch', () => {
  // NOT a colour test. StyleX is MOCKED in this environment — `stylex.props`
  // returns the same `"stylex-mock"` class for every style — so any assertion
  // comparing the chip's compiled class to the stroke's passes trivially,
  // whatever the two actually paint. A test that cannot fail is worse than none,
  // so the colour parity is enforced structurally instead: both the chip and the
  // stroke resolve from the single `TONE_INK` table in `charts.tsx`, and the
  // shipped CSS is checked at build time.
  it('is decoration beside a name the reader already has', () => {
    const { container } = render(<SeriesSwatch tone="primary" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

/**
 * A pointer move at `clientX`.
 *
 * Dispatched as a `MouseEvent`, not via `fireEvent.pointerMove`: jsdom does not
 * implement `PointerEvent`, so testing-library falls back to a bare `Event` and
 * `clientX` is silently dropped — the handler runs and reads `undefined`.
 */
function move(el: HTMLElement, clientX: number): void {
  fireEvent(el, new MouseEvent('pointermove', { clientX, bubbles: true }));
}

describe('DualAreaChart hover', () => {
  const rows = [
    { label: '2026-08-01', primary: 100, secondary: 20 },
    { label: '2026-08-02', primary: 300, secondary: 40 },
  ];

  it('reads BOTH series at the hovered bucket, each named', () => {
    const { container } = render(
      <DualAreaChart
        data={rows}
        primaryLabel="Memberships"
        secondaryLabel="Sales & POS"
        formatValue={(v) => `${v} GEL`}
        formatLabel={(l) => `on ${l}`}
      />,
    );
    const plot = container.firstElementChild as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    move(plot, 100);

    expect(screen.getByText('on 2026-08-02')).toBeInTheDocument();
    expect(screen.getByText(/Memberships 300 GEL/)).toBeInTheDocument();
    expect(screen.getByText(/Sales & POS 40 GEL/)).toBeInTheDocument();
  });

  it('clears the readout when the pointer leaves', () => {
    const { container } = render(<DualAreaChart data={rows} formatLabel={(l) => `on ${l}`} />);
    const plot = container.firstElementChild as HTMLElement;
    plot.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    move(plot, 0);
    expect(screen.getByText('on 2026-08-01')).toBeInTheDocument();
    fireEvent.pointerLeave(plot);
    expect(screen.queryByText('on 2026-08-01')).toBeNull();
  });
});

// The label column used to be an `auto` track. `justify-content` resolves to
// `stretch` by default, and with every cell track a fixed `1rem` that one
// flexible track absorbed the whole of a wide card's free width — the labels sat
// at its right edge and the heatmap looked shoved into the far half of the box.
describe('Heatmap sizing', () => {
  function grid(cols: number): HTMLElement | null {
    const { container } = render(
      <Heatmap
        rowLabels={['Mon', 'Tue']}
        colLabels={Array.from({ length: cols }, (_, i) => String(i))}
        cells={[
          [1, 2],
          [3, 4],
        ]}
      />,
    );
    return container.querySelector('[role="img"]');
  }

  it('pins the label column to its content and gives the width to the cells', () => {
    const columns = grid(24)?.style.gridTemplateColumns ?? '';
    expect(columns.startsWith('max-content')).toBe(true);
    expect(columns).not.toContain('auto');
    // Each hour is a flexible track with a floor, so the row spans the card and
    // still has something to scroll at when the card is narrower than the floor.
    expect(columns).toContain('repeat(24, minmax(1rem, 1fr))');
  });

  it('tracks the column count it was given', () => {
    expect(grid(7)?.style.gridTemplateColumns).toContain('repeat(7,');
  });
});
