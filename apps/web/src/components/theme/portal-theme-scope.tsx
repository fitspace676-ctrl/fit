import type { ReactNode } from 'react';
import type { PortalColorChoice } from '@fit/types';
import { brandedPortalThemeVars, getBrandSkin } from '@/lib/brand-skins';
import { BrandSkinProvider } from './brand-skin-provider';

/**
 * The tenant's colours, painted onto the member portal before anything renders.
 *
 * The colours the gym CHOSE arrive with the tenant lookup the locale layout
 * already performs, and this wraps the whole portal in the CSS custom properties
 * they translate to (see `portal-theme.ts` in `@fit/types` for which tokens and why). Every
 * `var(--color-accent)` in the app — the submit blocks, the chips, the "booked"
 * pills, the focus rings — then resolves to the gym's colour with no component
 * touched. It is the first consumer of these settings; before it, `primaryColor`
 * crossed the API boundary and nothing on this side read it.
 *
 * SERVER-RENDERED, and that is the point. The override has to be in the HTML the
 * browser first paints or the portal opens in the default palette and repaints
 * a frame later — the exact flash a client effect cannot avoid. The layout above
 * is already per-request (it reads the theme cookie), so resolving the tenant
 * there costs nothing that was not already being paid.
 *
 * Unbranded scopes use `display: contents` because this element must not exist as far as layout is
 * concerned: it sits between Astryx's own wrapper (which uses the same trick) and
 * screens that measure themselves against the viewport, and a stray block box
 * here would break every `min-height: 100vh` beneath it. Custom properties
 * inherit through it regardless — inheritance follows the element tree, not the
 * box tree. A registered skin needs a canvas box as well: body is outside
 * this token scope, so its old background cannot paint the branded page.
 *
 * INSIDE the Astryx `<Theme>` wrapper, never on `<html>`. The compiled theme
 * declares its tokens on that wrapper (`@scope ([data-astryx-theme])`), so a
 * declaration further up would be shadowed by the very palette it means to
 * replace. Being inside also puts this in the wrapper's `color-scheme`, which is
 * what makes the emitted `light-dark()` values resolve to the mode the portal's
 * own toggle is showing.
 *
 * Renders its children untouched when there is no tenant in scope (the apex
 * domain, a preview URL), or when there is neither a registered brand skin
 * nor a chosen portal colour. The shipped Lime Block
 * palette is the right default for a page that belongs to no gym, and equally
 * for one whose gym has not asked for anything else.
 */
export function PortalThemeScope({
  colors,
  slug,
  children,
}: {
  colors: PortalColorChoice | null;
  slug?: string | null;
  children: ReactNode;
}) {
  const skin = getBrandSkin(slug);
  const vars = brandedPortalThemeVars(slug, colors);
  if (Object.keys(vars).length === 0) {
    return <>{children}</>;
  }
  return (
    <div
      data-portal-skin={skin ? slug : undefined}
      style={
        skin
          ? {
              ...vars,
              minHeight: '100vh',
              backgroundColor: 'var(--color-background-body)',
              color: 'var(--color-text-primary)',
            }
          : { display: 'contents', ...vars }
      }
    >
      {skin ? <BrandSkinProvider logo={skin.logo}>{children}</BrandSkinProvider> : children}
    </div>
  );
}
