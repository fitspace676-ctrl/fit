// @fit/mobile — "Sign in with Apple" hook.
//
// Wraps expo-apple-authentication: it opens the native Sign in with Apple sheet
// (iOS only), returns an identity token on success, and exchanges it for a Fit
// session via {@link loginWithApple}. Availability is resolved at runtime
// (Android / older iOS / Expo Go without the native module report unavailable),
// so the login screen can degrade gracefully instead of showing a broken button.

import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { loginWithApple, type TokenPair } from './auth';

export type AppleSignInStatus = 'idle' | 'authenticating' | 'success' | 'error';

export interface UseAppleSignIn {
  /** True when Sign in with Apple is available on this device. */
  isAvailable: boolean;
  status: AppleSignInStatus;
  error: string | null;
  session: TokenPair | null;
  /** Open the native Apple sign-in sheet. */
  signIn: () => void;
}

/** Join Apple's split given/family name into a single display name, if present. */
function fullName(
  name: AppleAuthentication.AppleAuthenticationFullName | null,
): string | undefined {
  const parts = [name?.givenName, name?.familyName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Drive an Apple sign-in from a screen: render a button wired to `signIn`, then
 * react to `status` / `error` / `session`. Returns `isAvailable: false` on
 * platforms without Sign in with Apple so the screen can hide the button.
 *
 * Apple returns the user's name only on the first authorization; we forward it
 * to the API, which uses it solely when creating a new account. A user-cancelled
 * sheet (`ERR_REQUEST_CANCELED`) resets to idle rather than surfacing an error.
 */
export function useAppleSignIn(): UseAppleSignIn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [status, setStatus] = useState<AppleSignInStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TokenPair | null>(null);

  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setIsAvailable(available);
      })
      .catch(() => {
        if (active) setIsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = (): void => {
    setStatus('authenticating');
    setError(null);
    AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
      .then((credential) => {
        if (!credential.identityToken) {
          throw new Error('Apple did not return an identity token.');
        }
        return loginWithApple(credential.identityToken, fullName(credential.fullName));
      })
      .then((tokens) => {
        setSession(tokens);
        setStatus('success');
      })
      .catch((err: unknown) => {
        // The user dismissing the sheet isn't an error — return to idle quietly.
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'ERR_REQUEST_CANCELED'
        ) {
          setStatus('idle');
          return;
        }
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      });
  };

  return { isAvailable, status, error, session, signIn };
}
