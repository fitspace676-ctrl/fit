'use client';

import { useEffect, useRef, useState } from 'react';
import { loginWithApple } from '@/lib/auth';
import { Icon, buttonClasses } from '@/src/components/ui';

/** URL of the Sign in with Apple JS client library. */
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** Apple "Services ID" web client + its configured Return URL (NEXT_PUBLIC_*). */
const CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

type Status = 'idle' | 'authenticating' | 'success' | 'error';

/** Join Apple's split first/last name into a single display name, if present. */
function fullName(user: AppleIdSignInUser | undefined): string | undefined {
  const parts = [user?.name?.firstName, user?.name?.lastName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Renders a "Continue with Apple" button that drives the Sign in with Apple JS
 * popup flow and exchanges the returned ID token for a Fit session. Like the
 * Google button this is dependency-free: the Apple JS script is injected at
 * runtime rather than bundled.
 *
 * Apple returns the user's name only on the first authorization (never in the
 * token); we forward it to the API, which uses it solely when creating a new
 * account. When `NEXT_PUBLIC_APPLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_REDIRECT_URI`
 * are unset (e.g. a CI build) the component degrades to a short notice.
 */
export function AppleSignInButton() {
  const initialized = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID || !REDIRECT_URI) return;
    let cancelled = false;

    const init = (): void => {
      if (cancelled || initialized.current || !window.AppleID) return;
      window.AppleID.auth.init({
        clientId: CLIENT_ID,
        scope: 'name email',
        redirectURI: REDIRECT_URI,
        usePopup: true,
      });
      initialized.current = true;
      setReady(true);
    };

    if (window.AppleID) {
      init();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_JS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = APPLE_JS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);

    return () => {
      cancelled = true;
      script?.removeEventListener('load', init);
    };
  }, []);

  const signIn = (): void => {
    if (!window.AppleID) return;
    setStatus('authenticating');
    setError(null);
    window.AppleID.auth
      .signIn()
      .then((response) => loginWithApple(response.authorization.id_token, fullName(response.user)))
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      });
  };

  if (!CLIENT_ID || !REDIRECT_URI) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Apple sign-in is not configured (set <code>NEXT_PUBLIC_APPLE_CLIENT_ID</code> and{' '}
        <code>NEXT_PUBLIC_APPLE_REDIRECT_URI</code>).
      </p>
    );
  }

  const busy = status === 'authenticating';

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Sign in with Apple"
        disabled={!ready || busy}
        onClick={signIn}
        className={buttonClasses('outline', 'md', 'w-[280px] max-w-full')}
      >
        <Icon name="apple" className="h-4 w-4" sw={2} />
        {busy ? 'Signing you in…' : 'Continue with Apple'}
      </button>
      {status === 'success' && (
        <p className="text-sm text-success-600 dark:text-success-300">Signed in successfully.</p>
      )}
      {status === 'error' && error && (
        <p className="text-sm text-danger-600 dark:text-danger-300">{error}</p>
      )}
    </div>
  );
}
