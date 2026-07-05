// Astryx smoke route (T11.1) — proof that the Astryx foundation boots with the
// Fit brand tokens + fonts, NOT the neutral default.
//
// It renders the two primitives the task calls for — an Astryx `Button` and
// `Card` — plus a native heading/paragraph so the themed type (Archivo display,
// Manrope body) is visible. The primary Button reads `--color-accent`, which our
// theme paints electric-indigo (#6257E3), so a correctly-wired app shows an
// indigo button here rather than neutral gray. No screens are rebuilt on Astryx
// yet; this route exists purely to validate the wiring.

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';

export const metadata = {
  title: 'Astryx smoke — Fit web',
  robots: { index: false, follow: false },
};

export default function AstryxSmokePage() {
  return (
    <main style={{ padding: '3rem', display: 'grid', gap: '1.5rem', placeItems: 'start' }}>
      <h1>Astryx × Fit brand</h1>
      <p>
        If this button is electric indigo (#6257E3) and the heading is set in Archivo, the Fit
        Astryx theme is wired correctly — brand tokens and fonts are resolving, not the neutral
        defaults.
      </p>

      <Card width={420}>
        <div style={{ display: 'grid', gap: '1rem', padding: '1.5rem' }}>
          <h2>Card surface</h2>
          <p>This card and its buttons are styled entirely by Astryx reading Fit tokens.</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button label="Primary action" variant="primary" />
            <Button label="Secondary" variant="secondary" />
            <Button label="Ghost" variant="ghost" />
          </div>
        </div>
      </Card>
    </main>
  );
}
