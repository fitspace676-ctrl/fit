import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DualAreaChart } from './charts';

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

  // Two independently-scaled series would draw a 2 as tall as a 20.
  it('scales both series to the shared maximum', () => {
    const { container } = render(
      <DualAreaChart
        data={[
          { label: 'a', primary: 100, secondary: 0 },
          { label: 'b', primary: 100, secondary: 100 },
        ]}
        height={100}
      />,
    );
    const paths = [...container.querySelectorAll('path')];
    const primary = paths[1]?.getAttribute('d') ?? '';
    const secondary = paths[2]?.getAttribute('d') ?? '';
    // The point where both series hit 100 must sit at the same y.
    const primaryTopY = primary.split(/[ML]/).pop()?.split(',')[1];
    const secondaryTopY = secondary.split(/[ML]/).pop()?.split(',')[1];
    expect(primaryTopY).toBe(secondaryTopY);
  });

  it('renders an empty frame rather than crashing on no data', () => {
    const { container } = render(<DualAreaChart data={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});
