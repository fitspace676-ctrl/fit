'use client';

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { loginWithGoogle } from '@/lib/auth';

/** URL of the Google Identity Services client library. */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Web OAuth client id (inlined at build via NEXT_PUBLIC_*). */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type Status = 'idle' | 'authenticating' | 'success' | 'error';

// Astryx migration (T11.7): the GIS library renders its own button into the
// container, so this component only owns the wrapper + status copy — now
// authored in compiled StyleX on the Fit theme tokens and wired to next-intl.
const styles = stylex.create({
  wrapper: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  status: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  success: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-success)',
  },
  error: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  notice: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Renders Google's "Sign in with Google" button via the GIS client library and
 * exchanges the returned ID token for a Fit session. Dependency-free: the GIS
 * script is injected at runtime rather than bundled, so the web app pulls in no
 * Google npm package.
 *
 * When `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset (e.g. a CI build) the component
 * degrades to a short notice instead of rendering a non-functional button.
 */
export function GoogleSignInButton() {
  const t = useTranslations('auth');
  const buttonRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    const handleCredential = (response: GoogleCredentialResponse): void => {
      setStatus('authenticating');
      setError(null);
      loginWithGoogle(response.credential)
        .then(() => {
          if (!cancelled) setStatus('success');
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus('error');
          setError(err instanceof Error ? err.message : t('genericError'));
        });
    };

    const render = (): void => {
      if (cancelled || !window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 280,
      });
    };

    if (window.google) {
      render();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
    };
  }, [t]);

  if (!CLIENT_ID) {
    return <p {...stylex.props(styles.notice)}>{t('googleNotConfigured')}</p>;
  }

  return (
    <div {...stylex.props(styles.wrapper)}>
      <div ref={buttonRef} aria-label={t('continueWithGoogle')} />
      {status === 'authenticating' && <p {...stylex.props(styles.status)}>{t('signingIn')}</p>}
      {status === 'success' && <p {...stylex.props(styles.success)}>{t('signedIn')}</p>}
      {status === 'error' && error && <p {...stylex.props(styles.error)}>{error}</p>}
    </div>
  );
}
