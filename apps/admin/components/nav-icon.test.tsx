// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavIcon } from './nav-icon';
import { ThemeProvider } from '@/components/theme/theme-provider';

describe('NavIcon', () => {
  // The theme's icon accent already carries the light/dark pair, so the glyph
  // reads the token rather than a literal per mode, in both modes.
  it.each(['light', 'dark'] as const)('strokes the theme icon accent in %s mode', (mode) => {
    const { container } = render(
      <ThemeProvider initial={mode}>
        <NavIcon name="dashboard" />
      </ThemeProvider>,
    );
    const path = container.querySelector('path');
    expect(path?.style.stroke).toBe('var(--color-icon-accent)');
    expect(container.querySelector('radialGradient')).toBeNull();
  });
});
