// @fit/admin — no-FOUC theme reconciliation script (T11.5).
//
// The root layout already stamps the theme onto <html> from the `theme` cookie,
// so the normal (dynamic) SSR path never flashes. This inline script is the
// belt-and-suspenders for any path where the served HTML might be stale — a
// statically cached / edge-served document whose baked-in class predates the
// visitor's saved choice. It runs synchronously, before hydration and before
// the app paints, and reconciles all three theme surfaces from the cookie:
//   • the Tailwind `.dark` class          (legacy formacore screens)
//   • `data-theme` (→ `color-scheme`)      (Astryx `light-dark()` tokens)
//   • `data-astryx-theme="fit"`            (Astryx @scope'd brand CSS)
//
// Keep this dependency-free and inlined — it must execute before any React code.

import { THEME_COOKIE } from './theme-provider';

/** The reconciliation IIFE, stringified for inlining. Defaults to the dark
 *  Aurora-glass skin when no cookie is present (matches the server default). */
const script = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);var t=m?m[1]:'dark';var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.setAttribute('data-theme',t);e.setAttribute('data-astryx-theme','fit');}catch(_){}})();`;

/** Inline the pre-hydration theme reconciliation script. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
