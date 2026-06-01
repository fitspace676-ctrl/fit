'use client';

import { useEffect, useRef, useState } from 'react';
import { loginWithApple } from '@/lib/auth';

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
      <p className="text-sm text-slate-500">
        Apple sign-in is not configured (set <code>NEXT_PUBLIC_APPLE_CLIENT_ID</code> and{' '}
        <code>NEXT_PUBLIC_APPLE_REDIRECT_URI</code>).
      </p>
    );
  }

  const busy = status === 'authenticating';

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        aria-label="Sign in with Apple"
        disabled={!ready || busy}
        onClick={signIn}
        className={`flex h-11 w-[280px] items-center justify-center gap-2 rounded-full bg-black px-6 text-base font-medium text-white ${
          !ready || busy ? 'opacity-60' : ''
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 384 512" className="h-4 w-4 fill-current">
          <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C73.3 141.6 24 184.8 24 272.4c0 25.9 4.7 52.7 14.1 80.3 12.6 36.5 58 126 105.5 124.6 24.8-.6 42.3-17.6 74.5-17.6 31.3 0 47.5 17.6 75.2 17.6 47.9-.7 89-82.1 101-118.7-64.2-30.3-60.7-88.7-60.6-89.9zM255.8 73.4c30.3-36 27.6-68.8 26.7-80.6-25.8 1.5-55.6 17.6-72.6 37.4-18.7 21.2-29.7 47.4-27.3 79.4 27.9 2.2 53.4-12.2 73.2-36.2z" />
        </svg>
        {busy ? 'Signing you in…' : 'Continue with Apple'}
      </button>
      {status === 'success' && <p className="text-sm text-green-600">Signed in successfully.</p>}
      {status === 'error' && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
