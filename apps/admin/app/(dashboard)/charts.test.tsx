import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimatedCircularProgressBar, AreaChart, DualAreaChart } from './charts';

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
    // Area fill + primary stroke + secondary stroke.
    expect(container.querySelectorAll('path')).toHaveLength(3);
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
    const paths = [...container.querySelectorAll('path')];
    const primary = paths[1]?.getAttribute('d') ?? '';
    const secondary = paths[2]?.getAttribute('d') ?? '';
    const primaryTopY = primary.split(/[ML]/).pop()?.split(',')[1];
    const secondaryTopY = secondary.split(/[ML]/).pop()?.split(',')[1];
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
