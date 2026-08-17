import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { JetBrains_Mono, Noto_Sans_Georgian } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
// Astryx component styles (layer `astryx-base`) load AFTER globals.css so the
// layer is declared last and outranks Tailwind's `tw-base` preflight — see the
// cascade note in globals.css (T11.17, mirroring the web fix in T11.7). A CSS
// `@import` inside globals.css would load before its own rules and invert this
// order, so it is imported here.
import '@astryxdesign/core/astryx.css';
import { SentryInit } from './sentry-init';
import { TopLoader } from '@/components/top-loader';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_COOKIE, resolveTheme, type Theme } from '@/lib/theme';
import { AstryxProvider } from '@/components/theme/astryx-provider';

/**
 * The one UI family — Noto Sans Georgian, body AND display (`font-sans` and
 * `font-display` both resolve to it).
 *
 * It replaced Manrope + Archivo, which is not a taste change: neither ships
 * Georgian, so every Georgian string in the console fell back to a system face
 * mid-sentence — two type systems fighting inside one heading, on a product
 * whose staff work in Georgian. Noto Sans Georgian covers Georgian and Latin on
 * the same skeleton at every weight, so a heading holds together. The member
 * portal made the same swap; this puts the two apps on one face.
 */
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['latin', 'georgian'],
  variable: '--font-noto-georgian',
  display: 'swap',
});
/**
 * Data/mono font — JetBrains Mono (`font-mono`). Not a utility face here: the
 * direction treats numerals as its primary visual accent, so every id, price,
 * count and clock time in the console is set in it.
 */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fit - Admin',
  description: 'Fit admin console.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Seed the theme from the cookie so the painted `<html>` class matches the
  // client provider on first render — the console defaults to the dark skin.
  const theme: Theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);

  // Resolve the active locale (from the `NEXT_LOCALE` cookie via i18n/request.ts)
  // and its catalogue so both server components and the client provider translate
  // against the same source of truth.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${notoGeorgian.variable} ${jetbrains.variable} ${theme === 'dark' ? 'dark' : ''}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-ink-50 font-sans text-ink-900 antialiased dark:bg-ink-950 dark:text-white">
        {/* Re-apply a saved palette before first paint. The playground is a
            client component, so without this a chosen palette would flash the
            theme's own colours on every navigation — which is exactly the
            flicker that makes a colour hard to judge. Kept tiny and dependency
            free; the same expansion logic lives in `lib/color-overrides.ts`. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('fit-admin-palette')||'{}');if(!p||!Object.keys(p).length)return;var d=document.documentElement.classList.contains('dark');var s=document.documentElement.style;var hex=function(h){h=(h||'').replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');return /^[0-9a-f]{6}$/i.test(h)?[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]:null};var mix=function(a,b,t){var x=hex(a),y=hex(b);if(!x||!y)return null;return '#'+[0,1,2].map(function(i){return Math.round(x[i]+(y[i]-x[i])*t).toString(16).padStart(2,'0')}).join('')};var canvas=p.background||(d?'#1B1B1B':'#F1F1F1');if(p.accent){s.setProperty('--color-accent',p.accent);var m=mix(p.accent,canvas,d?0.72:0.86);if(m)s.setProperty('--color-accent-muted',m);var t=mix(p.accent,d?'#FFFFFF':'#000000',0.18);if(t){s.setProperty('--color-text-accent',t);s.setProperty('--color-icon-accent',t)}var c=hex(p.accent);if(c)s.setProperty('--color-on-accent',(0.299*c[0]+0.587*c[1]+0.114*c[2])/255>0.62?'#101010':'#FFFFFF');s.setProperty('--brand-gradient-from',p.accent);var gp=mix(p.accent,'#EC4899',0.55);if(gp)s.setProperty('--brand-gradient-to',gp)}if(p.background)s.setProperty('--color-background-body',p.background);if(p.surface){s.setProperty('--color-background-surface',p.surface);s.setProperty('--color-background-card',p.surface);var mu=mix(p.surface,d?'#FFFFFF':'#000000',0.06);if(mu)s.setProperty('--color-background-muted',mu);var ov=mix(p.surface,d?'#FFFFFF':'#000000',0.08);if(ov)s.setProperty('--color-overlay-hover',ov)}if(p.border){s.setProperty('--color-border',p.border);var be=mix(p.border,d?'#FFFFFF':'#000000',0.18);if(be)s.setProperty('--color-border-emphasized',be)}if(p.text)s.setProperty('--color-text-primary',p.text);if(p.textMuted)s.setProperty('--color-text-secondary',p.textMuted)}catch(e){}})()`,
          }}
        />
        <SentryInit />
        <TopLoader />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initial={theme}>
            <AstryxProvider>{children}</AstryxProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
