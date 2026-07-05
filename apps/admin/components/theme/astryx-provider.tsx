'use client';

// @fit/admin — Astryx theme bridge (T11.1).
//
// Wraps the admin console in Astryx's `<Theme>`, fed our built Fit brand theme
// (`@fit/astryx-theme/built`). The compiled token CSS is imported separately in
// globals.css; `<Theme>` just stamps `data-astryx-theme="fit"` + `data-theme`
// on <html>, which is what activates that scoped CSS and drives `light-dark()`.
//
// It reads the current mode from the console's existing `useTheme()` toggle (the
// Tailwind `.dark` source of truth) so Astryx and Tailwind stay in lockstep —
// no second toggle, no rebuilt screens. Must sit INSIDE `ThemeProvider`.

import type { ReactNode } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { fitTheme } from '@fit/astryx-theme/built';
import { useTheme } from './theme-provider';

export function AstryxProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Theme theme={fitTheme} mode={theme}>
      {children}
    </Theme>
  );
}
