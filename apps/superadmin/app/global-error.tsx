'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';

/**
 * Root error boundary. Catches errors thrown in the root layout itself — the one
 * place a segment-level `error.tsx` cannot reach. Because it REPLACES the root
 * layout, neither the theme nor `globals.css` is mounted underneath it, so this
 * page is styled inline against nothing: no design tokens, no `@fit/ui-kit`, no
 * StyleX. It is the one screen in the app that must render when the design
 * system itself is what failed. Only ever shown in production builds.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    setEventId(Sentry.captureException(error));
  }, [error]);

  const reference = eventId || error.digest;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#131312',
          color: '#F7F7F6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: '28rem', fontSize: '0.875rem', color: '#BABAB7' }}>
          The operator console failed to load. Please try again.
        </p>
        {reference ? (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#8F8F8B' }}>Reference: {reference}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '0.5rem',
            border: '1px solid #3E3E3B',
            borderRadius: '0.5rem',
            background: 'transparent',
            color: '#F7F7F6',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
