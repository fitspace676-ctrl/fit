import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { JetBrains_Mono, Noto_Sans_Georgian } from 'next/font/google';
import { Theme } from '@astryxdesign/core/theme';
import { formacoreTheme } from '@fit/astryx-theme/formacore';
import './globals.css';
// Astryx component styles load AFTER globals.css so their cascade layer is
// declared last. A CSS `@import` inside globals.css would load before its own
// rules and invert that order, so it is imported here.
import '@astryxdesign/core/astryx.css';
import { SentryInit } from './sentry-init';

/**
 * The one UI family — Noto Sans Georgian, body AND display. The same face the
 * console and the member portal wear: it covers Georgian and Latin on one
 * skeleton at every weight, so a heading that mixes them holds together.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['latin', 'georgian'],
  variable: '--font-noto-georgian',
  display: 'swap',
});

/** Data/mono face — every id, count and timestamp in the console is set in it. */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FormaCore - SuperAdmin',
  description: 'FormaCore platform operator console.',
};

/**
 * The operator console's root layout.
 *
 * It mounts the SAME theme as the console and the portal — FormaCore "Lime
 * Block" — in **dark mode, fixed**. No toggle, and that is deliberate: a theme
 * switch is a preference surface, and this app has exactly one user who works in
 * one place. The tenant apps carry a toggle because their users don't.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `<Theme>` syncs `data-theme` / `data-astryx-theme` onto <html> — but only
    // in a layout effect, i.e. after hydration. The theme's tokens are `@scope`d
    // to `[data-astryx-theme="formacore"]`, so until that runs the server-rendered
    // page resolves every colour to nothing and paints on a bare white canvas.
    // Stamping both attributes here means the first paint is already themed;
    // `<Theme>` then re-applies the same values and the wrapper it renders opens
    // its own identical scope, so nothing conflicts.
    <html
      lang="en"
      data-theme="dark"
      data-astryx-theme="formacore"
      className={`${notoGeorgian.variable} ${jetbrains.variable}`}
    >
      <body>
        <SentryInit />
        <Theme theme={formacoreTheme} mode="dark">
          {children}
        </Theme>
      </body>
    </html>
  );
}
