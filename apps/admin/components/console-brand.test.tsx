import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConsoleBrandProvider, ConsoleLogo } from './console-brand';
import { adminPath } from '@/lib/base-path';

describe('console logos', () => {
  it('uses a base-path-prefixed light/dark pair for Synergy', () => {
    const { container } = render(<ConsoleBrandProvider brand={{ slug: 'synergy' }}>
      <ConsoleLogo mode="light" /><ConsoleLogo mode="dark" />
    </ConsoleBrandProvider>);
    const images = container.querySelectorAll('img');
    expect(images[0]?.getAttribute('src')).toBe(adminPath('/brands/synergy/logo-light.png'));
    expect(images[1]?.getAttribute('src')).toBe(adminPath('/brands/synergy/logo-dark.png'));
    expect(images[0]?.alt).toBe('Synergy');
  });

  it('keeps uploads ahead of bundled assets', () => {
    const { container } = render(<ConsoleBrandProvider brand={{ slug: 'synergy', name: 'My gym', logoUrl: 'https://media.test/logo.png' }}>
      <ConsoleLogo mode="dark" />
    </ConsoleBrandProvider>);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://media.test/logo.png');
  });

  it('keeps the old logo for unknown gyms and supports a session slug', () => {
    const { container } = render(<><ConsoleLogo mode="light" slug="unknown" />
      <ConsoleLogo mode="dark" slug="synergy" /></>);
    const images = container.querySelectorAll('img');
    expect(images[0]?.getAttribute('src')).toBe(adminPath('/logolight.png'));
    expect(images[1]?.getAttribute('src')).toBe(adminPath('/brands/synergy/logo-dark.png'));
  });
});
