'use client';

import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { loginWithApple } from '@/lib/auth';
import { Icon } from '@/src/components/ui';

/** URL of the Sign in with Apple JS client library. */
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** Apple "Services ID" web client + its configured Return URL (NEXT_PUBLIC_*). */
const CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

type Status = 'idle' | 'authenticating' | 'success' | 'error';

// Astryx migration (T11.7): the hand-rolled `buttonClasses` anchor is replaced
// by an Astryx secondary `Button` with the Apple glyph as its leading icon;
// wrapper + status copy are compiled StyleX on the Fit theme tokens and the
// strings are wired to next-intl.
const styles = stylex.create({
  wrapper: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  button: {
    width: '280px',
    maxWidth: '100%',
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
  const t = useTranslations('auth');
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
        setError(err instanceof Error ? err.message : t('genericError'));
      });
  };

  if (!CLIENT_ID || !REDIRECT_URI) {
    return <p {...stylex.props(styles.notice)}>{t('appleNotConfigured')}</p>;
  }

  const busy = status === 'authenticating';

  return (
    <div {...stylex.props(styles.wrapper)}>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        label={busy ? t('signingIn') : t('continueWithApple')}
        icon={<Icon name="apple" />}
        isDisabled={!ready || busy}
        isLoading={busy}
        onClick={signIn}
        xstyle={styles.button}
      />
      {status === 'success' && <p {...stylex.props(styles.success)}>{t('signedIn')}</p>}
      {status === 'error' && error && <p {...stylex.props(styles.error)}>{error}</p>}
    </div>
  );
}
