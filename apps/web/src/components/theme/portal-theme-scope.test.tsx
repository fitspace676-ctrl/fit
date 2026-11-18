import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortalThemeScope } from './portal-theme-scope';
import { PortalLogo } from '../member/portal-logo';
import { portalThemeVars } from '@fit/types';

describe('PortalThemeScope', () => {
  it('keeps unskinned HTML byte-identical', () => {
    expect(
      renderToStaticMarkup(
        <PortalThemeScope slug="unknown" colors={null}>
          <b>Child</b>
        </PortalThemeScope>,
      ),
    ).toBe('<b>Child</b>');
    const colors = { primaryColor: '#112233' };
    expect(
      renderToStaticMarkup(
        <PortalThemeScope slug="unknown" colors={colors}>
          <b>Child</b>
        </PortalThemeScope>,
      ),
    ).toBe(
      renderToStaticMarkup(
        <div style={{ display: 'contents', ...portalThemeVars(colors) }}>
          <b>Child</b>
        </div>,
      ),
    );
  });
  it('server-renders the skin and its logo pair before hydration', () => {
    const html = renderToStaticMarkup(
      <PortalThemeScope slug="synergy" colors={null}>
        <PortalLogo logoUrl={null} />
      </PortalThemeScope>,
    );
    expect(html).toContain('--color-background-body:light-dark(#F3EDE3, #1C1C1E)');
    expect(html).toContain('--fc-membership:#765B49');
    expect(html).toContain('/brands/synergy/logo-dark.png');
    expect(html).toContain('/brands/synergy/logo-light.png');
  });
});
