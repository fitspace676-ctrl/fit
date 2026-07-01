'use client';

import { useEffect, useRef, useState } from 'react';
import { loginWithGoogle } from '@/lib/auth';

/** URL of the Google Identity Services client library. */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Web OAuth client id (inlined at build via NEXT_PUBLIC_*). */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type Status = 'idle' | 'authenticating' | 'success' | 'error';

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
          setError(err instanceof Error ? err.message : 'Sign-in failed');
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
  }, []);

  if (!CLIENT_ID) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Google sign-in is not configured (set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>).
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div ref={buttonRef} aria-label="Sign in with Google" />
      {status === 'authenticating' && (
        <p className="text-sm text-ink-500 dark:text-ink-400">Signing you in…</p>
      )}
      {status === 'success' && (
        <p className="text-sm text-success-600 dark:text-success-300">Signed in successfully.</p>
      )}
      {status === 'error' && error && (
        <p className="text-sm text-danger-600 dark:text-danger-300">{error}</p>
      )}
    </div>
  );
}
