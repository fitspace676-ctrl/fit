import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PortalLogo } from './portal-logo';

/**
 * The portal's mark, and the one decision in it worth a test: a gym uploads ONE
 * file, and the bundled wordmark it replaces is a theme PAIR.
 *
 * The regression this guards is silent by nature. Feeding a single tenant file
 * into `.member-logo-dark` / `.member-logo-light` renders the same image in both
 * slots — the markup still looks right, the page still lays out, and the mark is
 * simply invisible on whichever canvas its ink happens to match. Nobody notices
 * in review; a member notices at the door. So these assert the SHAPE of the two
 * renderings rather than their pixels: a tenant mark never joins the swap, and
 * the bundled pair never stops using it.
 *
 * StyleX is shimmed to a pass-through under Vitest (see `test/stylex-mock.ts`),
 * so the plate's own styles are not observable here — the class names are. What
 * is observable, and is what actually matters, is which files are emitted and
 * whether the theme-swap classes are on them.
 */

/** Every `<img>` the component rendered, as `{ src, className }`. */
function marks(container: HTMLElement): { src: string; className: string }[] {
  return [...container.querySelectorAll('img')].map((img) => ({
    src: img.getAttribute('src') ?? '',
    className: img.getAttribute('class') ?? '',
  }));
}

describe('PortalLogo', () => {
  describe('with no tenant mark', () => {
    it('renders the bundled pair and leaves the theme swap intact', () => {
      const { container } = render(<PortalLogo logoUrl={null} />);

      expect(marks(container)).toEqual([
        { src: '/logodark.png', className: 'member-logo member-logo-dark' },
        { src: '/logolight.png', className: 'member-logo member-logo-light' },
      ]);
    });

    // The sign-in panel's scrim is dark in BOTH themes, so the swap has nothing
    // to swap between there — the white-inked file is right either way.
    it('renders only the white-inked file over the photograph', () => {
      const { container } = render(<PortalLogo logoUrl={null} onPhoto />);

      const rendered = marks(container);
      expect(rendered).toHaveLength(1);
      expect(rendered[0]?.src).toBe('/logodark.png');
      expect(rendered[0]?.className).not.toContain('member-logo-light');
    });
  });

  describe('with a tenant mark', () => {
    const LOGO = 'https://cdn.example.com/gym-1/logos/mark.webp';

    it('renders the uploaded file once, and never through the two-file swap', () => {
      const { container } = render(<PortalLogo logoUrl={LOGO} />);

      const rendered = marks(container);
      expect(rendered).toHaveLength(1);
      expect(rendered[0]?.src).toBe(LOGO);
      // The heart of it: one file cannot be a pair, so it must not be dressed as
      // one. These classes would hide it outright on one of the two canvases.
      expect(rendered[0]?.className).not.toContain('member-logo-dark');
      expect(rendered[0]?.className).not.toContain('member-logo-light');
    });

    // The plate is the tenant mark's ground, and it is the SAME ground on the
    // themed headers and over the photograph — that invariance is the contract
    // the console states to the gym ("shown on a white plate"), so `onPhoto` must
    // not quietly change what a tenant mark renders as.
    it('renders identically over the photograph as on a themed surface', () => {
      const themed = render(<PortalLogo logoUrl={LOGO} />);
      const onPhoto = render(<PortalLogo logoUrl={LOGO} onPhoto />);

      expect(onPhoto.container.innerHTML).toBe(themed.container.innerHTML);
    });

    // The link around every call site carries the accessible name; a second one
    // here would announce the brand twice.
    it('is decorative — the surrounding link owns the accessible name', () => {
      const { container } = render(<PortalLogo logoUrl={LOGO} />);

      expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    });
  });
});
