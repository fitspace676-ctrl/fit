import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AreaChart, DualAreaChart } from './charts';

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
    // One area fill + one stroke.
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelectorAll('path')[1]?.getAttribute('d')).not.toContain('NaN');
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
    const stroke = container.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
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

  // The max must come from the real values only — a null coerced to 0 would be
  // harmless here, but a null coerced via Math.max would poison the scale.
  it('scales to the maximum of the present values', () => {
    const { container } = render(
      <AreaChart
        data={[
          { label: 'a', value: 100 },
          { label: 'b', value: null },
        ]}
        height={100}
      />,
    );
    const stroke = container.querySelectorAll('path')[1]?.getAttribute('d') ?? '';
    // 100 is the max, so it sits at the top: y = height - pad = 8.
    expect(stroke).toContain('8.0');
  });
});
