'use client';

import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@/src/i18n/navigation';

/**
 * The confirmation screen's "Return home" call to action.
 *
 * A client component for one specific reason: it renders Astryx's `Button`
 * polymorphically as next-intl's locale-aware `Link` (`as={Link}`), and a
 * *component* cannot cross the server→client boundary — React can only serialize
 * plain data, so passing `Link` as a prop from a Server Component throws
 * "Functions cannot be passed directly to Client Components". Marking the pair
 * as client-side keeps them on the same side of that boundary.
 *
 * (The confirmation page itself stays a Server Component: it reads cookies and
 * fetches the order server-side, and only this leaf is interactive.)
 */
const styles = stylex.create({
  cta: {
    textDecoration: 'none',
  },
});

export function HomeCta({ label }: { label: string }) {
  return (
    <Button as={Link} href="/" variant="primary" size="md" label={label} xstyle={styles.cta} />
  );
}
