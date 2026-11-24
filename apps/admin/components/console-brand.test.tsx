import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConsoleLogo } from './console-brand';
import { adminPath } from '@/lib/base-path';

describe('console logo', () => {
  it('is always FormaCore, in the ink for its surface', () => {
    const { container } = render(
      <>
        <ConsoleLogo mode="light" />
        <ConsoleLogo mode="dark" />
      </>,
    );
    const images = container.querySelectorAll('img');
    expect(images[0]?.getAttribute('src')).toBe(adminPath('/logolight.png'));
    expect(images[1]?.getAttribute('src')).toBe(adminPath('/logodark.png'));
    expect(images[0]?.alt).toBe('FormaCore');
  });
});
