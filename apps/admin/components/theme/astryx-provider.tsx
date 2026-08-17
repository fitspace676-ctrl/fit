'use client';

// @fit/admin — Astryx theme bridge.
//
// The console now wears the SAME theme as the member portal: FormaCore
// "Lime Block" — a warm charcoal ink canvas, exactly one chromatic voice (the
// lime), red as the single functional exception. It used to wear `fitTheme`,
// the Aurora-glass electric indigo, and the two apps read as two products.
//
// One theme rather than a console fork of it. The direction's substance is the
// ink ramp, the one accent and the radius ladder; none of that changes because
// the audience is staff. Where the console genuinely differs — denser rows,
// more surface steps for tables — that belongs to the components in
// `@fit/ui-kit`, not to a second palette that would have to be kept in step
// with this one by hand.
//
// NOTE: the compiled token CSS is imported separately in `globals.css`, and the
// two must name the SAME theme. `<Theme>` only stamps
// `data-astryx-theme="formacore"` + `data-theme` on <html>; if globals.css still
// imported `theme.css` (the `fit` build) that selector would never match and the
// console would render on Astryx's un-branded neutral defaults.
//
// It reads the current mode from the console's existing `useTheme()` toggle (the
// Tailwind `.dark` source of truth) so Astryx and Tailwind stay in lockstep —
// no second toggle, no rebuilt screens. Must sit INSIDE `ThemeProvider`.

import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { formacoreTheme } from '@fit/astryx-theme/formacore';
import { useTheme } from './theme-provider';

export function AstryxProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Theme theme={formacoreTheme} mode={theme}>
      {children}
    </Theme>
  );
}
