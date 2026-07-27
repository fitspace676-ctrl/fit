// Astryx smoke route (T11.1, extended in T11.2) — proof that the Astryx
// foundation boots with the Fit brand tokens + fonts, NOT the neutral default,
// AND that app-authored StyleX (`stylex.create` + the `xstyle` prop) compiles.
//
// It renders the two primitives the task calls for — an Astryx `Button` and
// `Card` — plus a native heading/paragraph so the themed type (Archivo display,
// Manrope body) is visible. The primary Button reads `--color-accent`, which our
// theme paints electric-indigo (#6257E3), so a correctly-wired app shows an
// indigo button here rather than neutral gray.
//
// T11.2: the page layout is no longer inline `style={{}}`. The wrapper grid, the
// card override, and the button row are authored with `stylex.create` and applied
// via `stylex.props(...)` (native elements) and the Astryx `xstyle` prop (Card).
// If this renders and `next build` succeeds, the StyleX SWC compiler is wired —
// the `@stylexjs/stylex` runtime throws on any un-compiled `stylex.create`.

import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';

export const metadata = {
  title: 'Astryx smoke - Fit admin',
  robots: { index: false, follow: false },
};

// App-authored StyleX. Values reference the Fit theme tokens (`--color-*`,
// `--radius-*`, injected by @fit/astryx-theme) so the compiled atoms stay
// theme-aware in both light and dark, exactly as `xstyle` on a real screen would.
const styles = stylex.create({
  page: {
    padding: '3rem',
    display: 'grid',
    gap: '1.5rem',
    placeItems: 'start',
  },
  card: {
    // A one-off layout override applied to the Astryx Card via `xstyle`.
    display: 'grid',
    gap: '1rem',
    padding: '1.5rem',
    borderRadius: 'var(--radius-container)',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
});

export default function AstryxSmokePage() {
  return (
    <main {...stylex.props(styles.page)}>
      <h1>Astryx × Fit brand</h1>
      <p>
        If this button is electric indigo (#6257E3) and the heading is set in Archivo, the Fit
        Astryx theme is wired correctly — brand tokens and fonts are resolving, not the neutral
        defaults. The grid, card padding, and button row below are compiled StyleX (T11.2).
      </p>

      <Card width={420} xstyle={styles.card}>
        <h2>Card surface</h2>
        <p>This card is laid out with an app-authored `xstyle` override, compiled at build time.</p>
        <div {...stylex.props(styles.actions)}>
          <Button label="Primary action" variant="primary" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Ghost" variant="ghost" />
        </div>
      </Card>
    </main>
  );
}
