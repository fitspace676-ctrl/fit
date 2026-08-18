'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@fit/ui-kit';

/**
 * Route-segment error boundary. Next.js renders this in place of the segment
 * whenever a Server/Client Component below the root layout throws, while keeping
 * the layout (`<html>`/`<body>`) intact — so the theme is still mounted here.
 * Fatal layout errors are handled by `global-error.tsx` instead.
 */
const styles = stylex.create({
  main: {
    display: 'flex',
    minHeight: '60vh',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: '1.5rem',
    paddingBlock: '3rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    maxWidth: '26rem',
    padding: '2rem',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  body: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  reference: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-tertiary, var(--color-text-secondary))',
  },
});

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    // Report to Sentry and keep the event id so the operator can quote it.
    // Falls back to Next's `digest` when Sentry is not configured.
    setEventId(Sentry.captureException(error));
  }, [error]);

  const reference = eventId || error.digest;

  return (
    <main {...stylex.props(styles.main)}>
      <Card padding="none" xstyle={styles.card}>
        <h1 {...stylex.props(styles.title)}>Unexpected error</h1>
        <p {...stylex.props(styles.body)}>
          Something went wrong in the operator console. Trying again often clears it.
        </p>
        {reference ? <p {...stylex.props(styles.reference)}>Reference: {reference}</p> : null}
        <Button type="button" variant="primary" size="sm" label="Try again" onClick={reset} />
      </Card>
    </main>
  );
}
