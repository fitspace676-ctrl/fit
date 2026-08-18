// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavIcon } from './nav-icon';
import { ThemeProvider } from '@/components/theme/theme-provider';

describe('NavIcon', () => {
  it('strokes the brand gradient in light mode', () => {
    const { container } = render(
      <ThemeProvider initial="light">
        <NavIcon name="dashboard" />
      </ThemeProvider>,
    );
    const path = container.querySelector('path');
    expect(path?.getAttribute('stroke')).toMatch(/^url\(#nav-icon-/);
    const gradient = container.querySelector('radialGradient');
    expect(gradient).not.toBeNull();
    expect(gradient?.querySelectorAll('stop')).toHaveLength(2);
  });

  it('strokes the flat brand lime in dark mode, with no gradient def', () => {
    const { container } = render(
      <ThemeProvider initial="dark">
        <NavIcon name="dashboard" />
      </ThemeProvider>,
    );
    const path = container.querySelector('path');
    expect(path?.getAttribute('stroke')).toBe('#E4F26A');
    expect(container.querySelector('radialGradient')).toBeNull();
  });
});
