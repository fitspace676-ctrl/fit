'use client';

// @fit/web — Astryx theme bridge (T11.1, retargeted by the FormaCore redesign).
//
// Wraps everything `apps/web` serves in Astryx's `<Theme>`, fed the built
// FormaCore "Lime Block" theme (`@fit/astryx-theme/formacore`) — the member
// portal's brand: charcoal ink canvas, one lime, Noto Sans Georgian, rounded
// blocks. The admin console keeps `fitTheme` (Aurora-glass indigo) via its own
// provider; the two themes compile to disjoint `[data-astryx-theme]` scopes, so
// this swap cannot reach it.
//
// The compiled token CSS is imported separately in globals.css; `<Theme>` just
// stamps `data-astryx-theme="formacore"` + `data-theme` on <html>, which is what
// activates that scoped CSS and drives `light-dark()`.
//
// It reads the current mode from the portal's existing `useTheme()` toggle (the
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
